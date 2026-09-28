import { Page } from "playwright";
import { assertLoggedIn, browserHasWaiters, jitter, openBrowser, warmup } from "./session";

export interface DeleteOptions {
  accountId: string;
  handle: string;
  /** How many items to remove after skipping. */
  count: number;
  /** Skip this many items at the top of the timeline before deleting. */
  startingAt: number;
  /** When true, reposts (retweets) are also removed via "Undo repost". */
  includeReposts?: boolean;
  headless?: boolean;
  onProgress?: (event: DeleteEvent) => void;
}

export type DeleteEvent =
  | { kind: "log"; message: string }
  | { kind: "deleted"; id: string; url: string; itemKind: ItemKind }
  | { kind: "skipped"; id: string; reason: string };

export interface DeleteResult {
  deleted: string[];
  skipped: string[];
}

type ItemKind = "tweet" | "repost";

interface CandidateTweet {
  id: string;
  url: string;
  itemKind: ItemKind;
}

// Read the currently rendered timeline articles. Returns tweets authored by
// `handle` and reposts made by `handle` (of anyone). Pinned tweets are always
// skipped — their caret menu has "Pin/Unpin" and Delete but treating them the
// same as other tweets makes it too easy to nuke the tweet a user pinned on
// purpose. If a user wants to delete a pinned tweet they can unpin it first.
async function readTimelineTweets(
  page: Page,
  handleLower: string,
): Promise<CandidateTweet[]> {
  return page.evaluate(({ handleLower }) => {
    type Out = { id: string; url: string; itemKind: "tweet" | "repost" };
    const out: Out[] = [];
    const seen = new Set<string>();
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const art of Array.from(articles)) {
      const social = art.querySelector('[data-testid="socialContext"]');
      const socialText = (social?.textContent ?? "").toLowerCase();
      if (/pinned/.test(socialText)) continue;
      // "reposted" / "retweeted" — this article is the current user's repost of
      // someone else's tweet. The caret will offer "Undo repost".
      const isRepost = /reposted|retweeted/.test(socialText);

      const anchors = art.querySelectorAll(
        'a[role="link"][href*="/status/"]',
      ) as NodeListOf<HTMLAnchorElement>;
      let id: string | null = null;
      let url: string | null = null;
      for (const a of Array.from(anchors)) {
        const m = a.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/);
        if (!m) continue;
        // For a tweet, require the author matches our handle. For a repost, the
        // status link goes to the original author (not us), so accept any.
        if (!isRepost && m[1].toLowerCase() !== handleLower) continue;
        id = m[2];
        url = `https://x.com${a.getAttribute("href")}`;
        break;
      }
      if (!id || !url || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, url, itemKind: isRepost ? "repost" : "tweet" });
    }
    return out;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, { handleLower } as any);
}

// Scroll a few times until we've collected at least `target` unique items, or
// we stop making progress. X lazy-loads ~5-10 tweets per scroll with a
// noticeable delay, so we scroll a full viewport at a time and give the fetch
// a couple of seconds before declaring progress dead. Filter to the kinds
// requested — reposts are collected only when includeReposts is true.
async function collectUpTo(
  page: Page,
  handleLower: string,
  target: number,
  includeReposts: boolean,
): Promise<CandidateTweet[]> {
  const seen = new Map<string, CandidateTweet>();
  let stagnantRounds = 0;

  for (let round = 0; round < 80; round++) {
    const batch = await readTimelineTweets(page, handleLower);
    const before = seen.size;
    for (const t of batch) {
      if (t.itemKind === "repost" && !includeReposts) continue;
      if (!seen.has(t.id)) seen.set(t.id, t);
    }
    if (seen.size >= target) break;
    if (seen.size === before) {
      stagnantRounds++;
      if (stagnantRounds >= 6) break;
    } else {
      stagnantRounds = 0;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await jitter(1800, 2800);
  }

  return Array.from(seen.values());
}

// Remove one item. For a tweet the caret menu offers "Delete" then a confirm
// dialog. For a repost it offers "Undo repost" which fires immediately with no
// confirm dialog. Both paths return once the article is off the timeline.
async function deleteOne(
  page: Page,
  tweet: CandidateTweet,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const article = page
    .locator(`article[data-testid="tweet"]`)
    .filter({ has: page.locator(`a[href*="/status/${tweet.id}"]`) })
    .first();

  try {
    await article.scrollIntoViewIfNeeded({ timeout: 5_000 });
  } catch {
    return { ok: false, reason: "article not in DOM" };
  }
  await jitter(400, 900);

  if (tweet.itemKind === "repost") {
    // On desktop, clicking the green retweet-icon toggle opens a dropdown menu
    // whose "Undo repost" is a role=menuitem. No separate confirm sheet — the
    // action fires as soon as that menu item is clicked. Fall back to the
    // caret > Undo repost path if the icon toggle isn't rendered.
    const unrepostBtn = article.locator('button[data-testid="unretweet"]').first();
    let opened = false;
    try {
      await unrepostBtn.waitFor({ state: "visible", timeout: 2_000 });
      await unrepostBtn.click({ timeout: 3_000 });
      opened = true;
    } catch {
      // toggle missing — try caret
    }
    if (!opened) {
      const caret = article.locator('button[data-testid="caret"]').first();
      try {
        await caret.waitFor({ state: "visible", timeout: 4_000 });
        await caret.click({ timeout: 4_000 });
      } catch {
        return { ok: false, reason: "caret menu not clickable" };
      }
    }
    await jitter(300, 700);

    const undoItem = page
      .getByRole("menuitem", { name: /Undo repost|Undo Retweet/i })
      .first();
    try {
      await undoItem.waitFor({ state: "visible", timeout: 4_000 });
      await undoItem.click({ timeout: 4_000 });
    } catch {
      await page.keyboard.press("Escape").catch(() => {});
      return { ok: false, reason: "no Undo repost menu item" };
    }

    // No confirm sheet on desktop — the menuitem click is the action. Wait for
    // the article to fall off the current user's profile timeline.
    try {
      await article.waitFor({ state: "detached", timeout: 8_000 });
    } catch {
      // Menu might still be closing; ok to continue and let the next iteration
      // re-read the timeline.
    }
    await jitter(1200, 2400);
    return { ok: true };
  }

  // Tweet path: caret > Delete > confirm.
  const caret = article.locator('button[data-testid="caret"]').first();
  try {
    await caret.waitFor({ state: "visible", timeout: 4_000 });
    await caret.click({ timeout: 4_000 });
  } catch {
    return { ok: false, reason: "caret menu not clickable" };
  }
  await jitter(300, 700);

  const deleteItem = page.getByRole("menuitem", { name: /^Delete$/i }).first();
  try {
    await deleteItem.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return { ok: false, reason: "no Delete option (not your tweet?)" };
  }
  await deleteItem.click({ timeout: 3_000 });
  await jitter(300, 600);

  const confirm = page
    .locator('button[data-testid="confirmationSheetConfirm"]')
    .first();
  try {
    await confirm.waitFor({ state: "visible", timeout: 4_000 });
    await confirm.click({ timeout: 4_000 });
  } catch {
    return { ok: false, reason: "confirm dialog didn't appear" };
  }

  try {
    await article.waitFor({ state: "detached", timeout: 8_000 });
  } catch {
    await confirm.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
  }
  await jitter(1200, 2400);
  return { ok: true };
}

export async function deleteTweets(opts: DeleteOptions): Promise<DeleteResult> {
  const { accountId, handle, count, startingAt } = opts;
  const includeReposts = opts.includeReposts ?? false;
  const emit = opts.onProgress ?? (() => {});
  const handleLower = handle.toLowerCase();

  emit({
    kind: "log",
    message:
      `Opening @${handle}'s timeline (skip ${startingAt}, remove up to ${count}, ` +
      `${includeReposts ? "tweets + reposts" : "tweets only"})`,
  });

  const browser = await openBrowser("twitter", {
    headless: opts.headless ?? false,
    accountId,
  });
  const { page } = browser;

  const deleted: string[] = [];
  const skipped: string[] = [];

  try {
    try {
      await warmup(page, "https://x.com/home");
    } catch (err) {
      console.warn("[twitter-delete] warmup skipped:", err);
    }
    assertLoggedIn(page);

    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded" });
    await jitter(2000, 3500);
    assertLoggedIn(page);

    try {
      await page
        .locator('article[data-testid="tweet"]')
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      throw new Error("Couldn't load @" + handle + "'s timeline (no articles rendered).");
    }

    // Delete one tweet per iteration. After each deletion the timeline shifts
    // up by one, so the tweet at index `startingAt` in the freshly-read list is
    // always the correct next target. Re-reading also side-steps the DOM
    // virtualization that made earlier "collect all up-front" approaches lose
    // locators after scrolling to the bottom to load more.
    let attempted = 0;
    let consecutiveNoTarget = 0;
    let consecutiveFailures = 0;
    while (attempted < count) {
      // A long delete run would otherwise hold the browser for minutes while
      // a due scheduled post waits for it. Stop and let the post go out.
      if (browserHasWaiters("twitter", opts.accountId)) {
        emit({
          kind: "log",
          message: "Stopping early so a scheduled post can go out. Run the job again to continue.",
        });
        break;
      }
      attempted++;

      // A previous iteration may have left an open menu, dropdown, or bottom
      // sheet — dismiss anything overlaying the timeline before we scroll and
      // re-read, otherwise the next caret click gets intercepted.
      await page.keyboard.press("Escape").catch(() => {});
      await jitter(150, 350);
      await page.keyboard.press("Escape").catch(() => {});
      await jitter(150, 350);

      await page.evaluate(() => window.scrollTo(0, 0));
      await jitter(600, 1100);

      const collected = await collectUpTo(
        page,
        handleLower,
        startingAt + 1,
        includeReposts,
      );
      const target = collected[startingAt];
      if (!target) {
        emit({
          kind: "log",
          message: `No tweet at index ${startingAt} (timeline has ${collected.length}). Stopping.`,
        });
        consecutiveNoTarget++;
        if (consecutiveNoTarget >= 2) break;
        continue;
      }
      consecutiveNoTarget = 0;

      emit({
        kind: "log",
        message:
          `(${attempted}/${count}) ${target.itemKind === "repost" ? "un-reposting" : "deleting"} ${target.url}`,
      });
      const result = await deleteOne(page, target);
      if (result.ok) {
        consecutiveFailures = 0;
        deleted.push(target.id);
        emit({
          kind: "deleted",
          id: target.id,
          url: target.url,
          itemKind: target.itemKind,
        });
      } else {
        consecutiveFailures++;
        if (!skipped.includes(target.id)) skipped.push(target.id);
        emit({ kind: "skipped", id: target.id, reason: result.reason });
        // The same item stays at index `startingAt` after a failure, so the
        // next iterations retry it. A couple of retries are worth it, but an
        // item that can't be deleted would otherwise burn the whole count.
        if (consecutiveFailures >= 3) {
          emit({
            kind: "log",
            message: `Stopping after 3 consecutive failures.`,
          });
          break;
        }
      }
    }

    emit({
      kind: "log",
      message: `Done. Deleted ${deleted.length}, skipped ${skipped.length}.`,
    });
    return { deleted, skipped };
  } finally {
    await browser.close();
  }
}
