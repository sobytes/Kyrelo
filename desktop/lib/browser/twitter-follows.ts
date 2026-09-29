import { Page, Response } from "playwright";
import type { FollowedAccount } from "../unfollow-rules";
import { assertLoggedIn, postWaitingForBrowser, jitter } from "./session";

// Reading and changing who an X account follows, for the Unfollow tab.
//
// Stats (followers, posts, account age…) aren't shown on the Following page,
// but the page downloads them: X's web app fetches each batch of the list from
// its GraphQL API with the full user objects. We read those responses as the
// page scrolls, so no profile has to be opened. The page itself is the
// fallback: if X changes the data's shape, the handles and "Follows you" still
// come from the list, just without stats.

export type Emit = (message: string) => void;

// --- Reading X's data ---------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** X's "Wed Oct 10 20:19:24 +0000 2018" as ISO, or undefined. */
function xDate(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Every user object in a GraphQL response. X keeps moving fields out of
 * `legacy` into newer sub-objects (`core`, `avatar`, `profile_bio`,
 * `relationship_counts`, `tweet_counts`, `relationship_perspectives`; in
 * 2026 `legacy` is gone), so each field is read from wherever it is.
 */
export type XUser = FollowedAccount & { id: string; youFollow?: boolean };

export function usersFromResponse(json: unknown): XUser[] {
  const out: XUser[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObject(node)) return;
    if (node.__typename === "User" && typeof node.rest_id === "string") {
      const legacy = isObject(node.legacy) ? node.legacy : {};
      const core = isObject(node.core) ? node.core : {};
      const avatar = isObject(node.avatar) ? node.avatar : {};
      const relationship = isObject(node.relationship_perspectives) ? node.relationship_perspectives : {};
      const counts = isObject(node.relationship_counts) ? node.relationship_counts : {};
      const tweetCounts = isObject(node.tweet_counts) ? node.tweet_counts : {};
      const handle = str(core.screen_name) ?? str(legacy.screen_name);
      if (handle) {
        const avatarUrl = str(avatar.image_url) ?? str(legacy.profile_image_url_https) ?? "";
        out.push({
          id: node.rest_id,
          handle,
          name: str(core.name) ?? str(legacy.name) ?? handle,
          bio: str(legacy.description) ?? (isObject(node.profile_bio) ? str(node.profile_bio.description) : undefined),
          followers: num(counts.followers) ?? num(legacy.followers_count),
          following: num(counts.following) ?? num(legacy.friends_count),
          posts: num(tweetCounts.tweets) ?? num(legacy.statuses_count),
          createdAt: xDate(core.created_at) ?? xDate(legacy.created_at),
          defaultAvatar: bool(legacy.default_profile_image) ?? (avatarUrl ? avatarUrl.includes("default_profile") : undefined),
          followsYou: bool(relationship.followed_by) ?? bool(legacy.followed_by) ?? false,
          youFollow: bool(relationship.following) ?? bool(legacy.following),
        });
      }
      return; // a user's own fields don't contain the users we want
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(json);
  return out;
}

/** The newest post (or repost) by `userId` in a GraphQL response, as ISO. */
export function latestPostIn(json: unknown, userId: string): string | undefined {
  let latest: string | undefined;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObject(node)) return;
    const legacy = isObject(node.legacy) ? node.legacy : undefined;
    if (legacy && legacy.user_id_str === userId && typeof legacy.id_str === "string") {
      const at = xDate(legacy.created_at);
      if (at && (!latest || at > latest)) latest = at;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(json);
  return latest;
}

/** Calls `onJson` with each GraphQL response for `operation` until the returned stop is called. */
function watchGraphql(page: Page, operation: string, onJson: (json: unknown) => void): () => void {
  const pattern = new RegExp(`/graphql/[^/]+/${operation}\\?`);
  const listener = (res: Response) => {
    if (!pattern.test(res.url()) || !res.ok()) return;
    res.json().then(onJson, () => {});
  };
  page.on("response", listener);
  return () => page.off("response", listener);
}

// --- The Following list ---------------------------------------------------------

export interface FollowingScan {
  accounts: (FollowedAccount & { id?: string })[];
  /** False when X's data couldn't be read, so accounts have no stats. */
  hasStats: boolean;
  /** Stopped before the end of the list (a scheduled post needed the browser). */
  partial: boolean;
}

const MAX_SCROLLS = 800; // ~10,000 accounts
const STALL_SCROLLS = 8;

/** Scrolls x.com/<handle>/following to the end and returns everyone on it. */
export async function scanFollowing(page: Page, accountId: string, handle: string, emit: Emit): Promise<FollowingScan> {
  const fromData = new Map<string, XUser>();
  const stop = watchGraphql(page, "Following", (json) => {
    for (const u of usersFromResponse(json)) fromData.set(u.handle.toLowerCase(), u);
  });
  const fromPage = new Map<string, { handle: string; name: string; followsYou: boolean }>();
  let partial = false;
  try {
    await page.goto(`https://x.com/${handle}/following`, { waitUntil: "domcontentloaded" });
    await jitter(2500, 4000);
    assertLoggedIn(page);
    try {
      await page.locator('[data-testid="primaryColumn"] [data-testid="UserCell"]').first().waitFor({ timeout: 15_000 });
    } catch {
      throw new Error(`Couldn't load @${handle}'s Following list. Is anyone followed?`);
    }

    let stalled = 0;
    for (let round = 0; round < MAX_SCROLLS && stalled < STALL_SCROLLS; round++) {
      if (postWaitingForBrowser("twitter", accountId)) {
        partial = true;
        emit("Stopping early so a scheduled post can go out. Scan again afterwards for the full list.");
        break;
      }
      const before = fromPage.size;
      for (const cell of await readUserCells(page)) fromPage.set(cell.handle.toLowerCase(), cell);
      stalled = fromPage.size === before ? stalled + 1 : 0;
      if (round % 10 === 0) emit(`Read ${fromPage.size} accounts so far…`);
      await page.mouse.wheel(0, 900 + Math.random() * 500);
      await jitter(1400, 2600);
    }
  } finally {
    stop();
  }

  // The page's list decides who's followed; X's data adds the stats.
  const accounts = [...fromPage.entries()].map(([key, cell]) => fromData.get(key) ?? cell);
  for (const [key, user] of fromData) if (!fromPage.has(key)) accounts.push(user);
  // Users found but no counts means X moved them again (see usersFromResponse).
  const hasStats = [...fromData.values()].some((u) => u.followers !== undefined);
  emit(`Found ${accounts.length} followed accounts${hasStats ? "" : " (X's stats weren't readable, so only handles)"}.`);
  return { accounts, hasStats, partial };
}

/** Handles, names and "Follows you" from the rendered Following list. */
function readUserCells(page: Page): Promise<{ handle: string; name: string; followsYou: boolean }[]> {
  return page.evaluate(() => {
    const out: { handle: string; name: string; followsYou: boolean }[] = [];
    const cells = document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="UserCell"]');
    for (const cell of Array.from(cells)) {
      let handle: string | null = null;
      for (const a of Array.from(cell.querySelectorAll("a[href]"))) {
        const m = a.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/);
        if (m) {
          handle = m[1];
          break;
        }
      }
      if (!handle) continue;
      const nameEl = cell.querySelector(`a[href="/${handle}"] span`);
      out.push({
        handle,
        name: nameEl?.textContent?.trim() || handle,
        followsYou: !!cell.querySelector('[data-testid="userFollowIndicator"]'),
      });
    }
    return out;
  });
}

// --- Interactions ------------------------------------------------------------------

const NOTIFICATION_SCROLLS = 25;

/**
 * Lowercase handles that recently liked, reposted, quoted, replied to or
 * mentioned the user (from Notifications), plus people the user replied to
 * (from their Replies tab). New followers alone don't count.
 */
export async function scanInteractions(page: Page, handle: string, emit: Emit): Promise<Set<string>> {
  const me = handle.toLowerCase();
  const found = new Set<string>();

  await page.goto("https://x.com/notifications", { waitUntil: "domcontentloaded" });
  await jitter(2500, 4000);
  assertLoggedIn(page);
  for (let i = 0; i < NOTIFICATION_SCROLLS; i++) {
    for (const h of await readNotificationHandles(page)) if (h !== me) found.add(h);
    await page.mouse.wheel(0, 900 + Math.random() * 400);
    await jitter(1200, 2200);
  }
  emit(`${found.size} ${found.size === 1 ? "person" : "people"} interacted with you in your notifications.`);

  await page.goto(`https://x.com/${handle}/with_replies`, { waitUntil: "domcontentloaded" });
  await jitter(2500, 4000);
  assertLoggedIn(page);
  const before = found.size;
  for (let i = 0; i < NOTIFICATION_SCROLLS; i++) {
    for (const h of await readRepliedTo(page, me)) if (h !== me) found.add(h);
    await page.mouse.wheel(0, 900 + Math.random() * 400);
    await jitter(1200, 2200);
  }
  emit(`${found.size - before} more you've replied to recently.`);
  return found;
}

function readNotificationHandles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    // Likes, reposts and follows are grouped notifications with avatars that
    // link to profiles. Only engagement counts, not "followed you".
    for (const n of Array.from(document.querySelectorAll('article[data-testid="notification"]'))) {
      const text = n.textContent ?? "";
      if (!/liked|reposted|quoted|replied|mentioned/i.test(text)) continue;
      for (const a of Array.from(n.querySelectorAll("a[href]"))) {
        const m = a.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/);
        if (m) out.push(m[1].toLowerCase());
      }
    }
    // Replies, mentions and quotes are shown as posts by the other person.
    for (const t of Array.from(document.querySelectorAll('article[data-testid="tweet"]'))) {
      for (const a of Array.from(t.querySelectorAll("a[href*='/status/']"))) {
        const m = a.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})\/status\//);
        if (m) {
          out.push(m[1].toLowerCase());
          break;
        }
      }
    }
    return out;
  });
}

/** Handles the user's own replies are addressed to ("Replying to @x"). */
function readRepliedTo(page: Page, me: string): Promise<string[]> {
  return page.evaluate((me) => {
    const out: string[] = [];
    for (const t of Array.from(document.querySelectorAll('article[data-testid="tweet"]'))) {
      const author = Array.from(t.querySelectorAll("a[href*='/status/']"))
        .map((a) => a.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})\/status\//)?.[1]?.toLowerCase())
        .find(Boolean);
      if (author !== me) continue;
      for (const a of Array.from(t.querySelectorAll("a[href]"))) {
        const m = a.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/);
        if (m && (a.textContent ?? "").startsWith("@")) out.push(m[1].toLowerCase());
      }
    }
    return out;
  }, me);
}

// --- One profile -----------------------------------------------------------------

const settle = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

export interface ProfileVisit {
  /** The profile's stats, from the data X's page loads. */
  user?: XUser;
  /** ISO time of their newest original post, null if they have none, undefined if the page couldn't tell. */
  lastPostAt: string | null | undefined;
  /** X says the account doesn't exist or is suspended. */
  missing: boolean;
}

/** Opens x.com/<handle> and reads who they are and when they last posted. */
export async function visitProfile(page: Page, handle: string): Promise<ProfileVisit> {
  // Started before navigating so the responses can't be missed. The timeline
  // one can land after the posts render, so it's awaited, briefly.
  const onResponse = (operation: RegExp) =>
    page
      .waitForResponse((res) => operation.test(res.url()) && res.ok(), { timeout: 15_000 })
      .then((res) => res.json())
      .catch(() => undefined);
  const profileData = onResponse(/\/graphql\/[^/]+\/UserByScreenName\?/);
  // The operation was UserTweets until 2026.
  const timelineData = onResponse(/\/graphql\/[^/]+\/(UserTweets|UserOriginalsTimeline)\?/);

  await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded" });
  assertLoggedIn(page);
  const loaded = await page
    .locator('article[data-testid="tweet"], [data-testid="emptyState"]')
    .first()
    .waitFor({ timeout: 12_000 })
    .then(() => true, () => false);

  const user = usersFromResponse(await settle(profileData, 3_000)).find(
    (u) => u.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!user) {
    const missing = (await page.getByText(/this account doesn.t exist|account suspended/i).count()) > 0;
    return { lastPostAt: undefined, missing };
  }

  const latest = latestPostIn(await settle(timelineData, 3_000), user.id);
  if (latest) return { user, lastPostAt: latest, missing: false };
  if (!loaded) return { user, lastPostAt: undefined, missing: false };
  // Fallback: the newest dated post of theirs on the page (pinned ones are
  // usually old, reposts show the original's date, so both are skipped).
  const fromPage = await page.evaluate((h) => {
    let newest: string | null = null;
    for (const art of Array.from(document.querySelectorAll('article[data-testid="tweet"]'))) {
      if (/pinned/i.test(art.querySelector('[data-testid="socialContext"]')?.textContent ?? "")) continue;
      for (const a of Array.from(art.querySelectorAll("a[href*='/status/']"))) {
        if (a.getAttribute("href")?.split("/")[1]?.toLowerCase() !== h) continue;
        const dt = a.querySelector("time")?.getAttribute("datetime");
        if (dt && (!newest || dt > newest)) newest = dt;
      }
    }
    return newest;
  }, handle.toLowerCase());
  if (fromPage) return { user, lastPostAt: fromPage, missing: false };
  const empty = (await page.locator('[data-testid="emptyState"]').count()) > 0;
  return { user, lastPostAt: empty ? null : undefined, missing: false };
}

// --- X's own suggestions ------------------------------------------------------------

const WHO_TO_FOLLOW_SCROLLS = 6;

/** The accounts on X's "Who to follow" page for this account, with stats where X's data had them. */
export async function readWhoToFollow(page: Page, emit: Emit): Promise<(FollowedAccount & { id?: string })[]> {
  const fromData = new Map<string, XUser>();
  const stop = watchGraphql(page, "[A-Za-z]+", (json) => {
    for (const u of usersFromResponse(json)) fromData.set(u.handle.toLowerCase(), u);
  });
  const handles = new Map<string, { handle: string; name: string; followsYou: boolean }>();
  try {
    await page.goto("https://x.com/i/connect_people", { waitUntil: "domcontentloaded" });
    await jitter(2500, 4000);
    assertLoggedIn(page);
    for (let i = 0; i < WHO_TO_FOLLOW_SCROLLS; i++) {
      for (const cell of await readUserCells(page)) handles.set(cell.handle.toLowerCase(), cell);
      await page.mouse.wheel(0, 900 + Math.random() * 400);
      await jitter(1400, 2400);
    }
  } finally {
    stop();
  }
  // The page's list decides who's suggested; X's data adds the stats.
  const suggested = [...handles.entries()]
    .map(([key, cell]) => fromData.get(key) ?? cell)
    .filter((u) => !("youFollow" in u && u.youFollow));
  emit(`X suggests ${suggested.length} accounts for you.`);
  return suggested;
}

/**
 * Follows or unfollows `handle` from their profile: the Following button,
 * then X's confirm sheet (unfollow only), then waits for the button to flip.
 */
export async function setFollowing(
  page: Page,
  handle: string,
  userId: string | undefined,
  follow: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded" });
  assertLoggedIn(page);
  // X marks the button "<userId>-follow" or "<userId>-unfollow". Other
  // accounts' buttons ("Who to follow") are on the page too, so match this
  // account's id, or else the profile header's button.
  const button = (state: "follow" | "unfollow") =>
    page
      .locator(
        userId
          ? `[data-testid="${userId}-${state}"]`
          : `[data-testid="primaryColumn"] [data-testid="placementTracking"] [data-testid$="-${state}"]`,
      )
      .first();
  const current = button(follow ? "follow" : "unfollow");
  const flipped = button(follow ? "unfollow" : "follow");
  try {
    await current.or(flipped).first().waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    return { ok: false, reason: "profile didn't load (suspended or renamed?)" };
  }
  if (await flipped.isVisible()) return { ok: true }; // already done
  await jitter(700, 1600);
  await current.click({ timeout: 5_000 });
  if (!follow) {
    const confirm = page.locator('[data-testid="confirmationSheetConfirm"]').first();
    try {
      await confirm.waitFor({ state: "visible", timeout: 5_000 });
      await jitter(300, 700);
      await confirm.click({ timeout: 5_000 });
    } catch {
      return { ok: false, reason: "X didn't show the unfollow confirmation" };
    }
  }
  try {
    await flipped.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    return { ok: false, reason: "X didn't confirm it (you may have hit X's limit, try again later)" };
  }
  return { ok: true };
}
