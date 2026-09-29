import { Page } from "playwright";
import { lastPostedAt, scanFollowing, scanInteractions, setFollowing } from "./browser/twitter-follows";
import { postWaitingForBrowser, jitter, openBrowser, warmup } from "./browser/session";
import { getGrokSettings, getUnfollowData, listAccounts, modifyUnfollowData } from "./storage";
import { Account, FollowChange, UnfollowData } from "./types";
import {
  INTERACTION_WINDOW_DAYS,
  protectionReason,
  UnfollowContext,
  UnfollowRules,
  unfollowReasons,
} from "./unfollow-rules";

// The Unfollow tab's background jobs, one at a time, like the Deleter
// (lib/deleter.ts): the UI starts one and polls GET /api/unfollow.
//   scan      read the Following list, then who interacts with the user
//   activity  open profiles to see when each last posted
//   unfollow  unfollow the chosen accounts, slowly
//   refollow  follow back accounts unfollowed by mistake

/** X locks accounts that unfollow in bulk, so runs are capped and paced. */
export const MAX_UNFOLLOWS_PER_RUN = 100;
export const MAX_UNFOLLOWS_PER_DAY = 300;
export const MAX_ACTIVITY_CHECKS_PER_RUN = 200;
const MAX_HISTORY = 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UnfollowJobKind = "scan" | "activity" | "unfollow" | "refollow";

export interface UnfollowJob {
  id: string;
  kind: UnfollowJobKind;
  accountId: string;
  handle: string;
  startedAt: string;
  finishedAt?: string;
  running: boolean;
  /** Accounts to go through (0 for a scan). */
  total: number;
  done: number;
  failed: number;
  log: string[];
  error?: string;
}

// On globalThis so Next dev hot-reload doesn't lose a running job.
const G = globalThis as { __kyreloUnfollowJob?: UnfollowJob | null };

export function getUnfollowJob(): UnfollowJob | null {
  return G.__kyreloUnfollowJob ?? null;
}

/** What the rules need besides the accounts: keep list, Monitor handles, interactions. */
export async function unfollowContext(data: UnfollowData, now = new Date()): Promise<UnfollowContext> {
  const settings = await getGrokSettings();
  return {
    keep: data.keep,
    watched: settings.handles.map((h) => h.toLowerCase()),
    interactions: data.interactions,
    interactionsScannedAt: data.interactionsScannedAt,
    now,
  };
}

type Result = { job: UnfollowJob } | { error: string };

async function findAccount(accountId: string): Promise<Account | undefined> {
  return (await listAccounts("twitter")).find((a) => a.id === accountId);
}

/**
 * Starts `work` in a visible Chrome on the account's profile, as the Deleter
 * does, and returns the job at once.
 */
function run(
  kind: UnfollowJobKind,
  account: Account,
  total: number,
  work: (page: Page, job: UnfollowJob, record: (line: string) => void) => Promise<void>,
): Result {
  if (getUnfollowJob()?.running) return { error: "Another Unfollow job is already running." };
  const job: UnfollowJob = {
    id: crypto.randomUUID(),
    kind,
    accountId: account.id,
    handle: account.handle,
    startedAt: new Date().toISOString(),
    running: true,
    total,
    done: 0,
    failed: 0,
    log: [],
  };
  G.__kyreloUnfollowJob = job;
  const record = (line: string) => {
    job.log.push(`[${new Date().toISOString()}] ${line}`);
    if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
  };

  (async () => {
    try {
      const browser = await openBrowser("twitter", { purpose: `unfollow-${kind}`, headless: false, accountId: account.id });
      try {
        await warmup(browser.page, "https://x.com/home").catch((err) => console.warn("[unfollow] warmup skipped:", err));
        await work(browser.page, job, record);
      } finally {
        await browser.close();
      }
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      record(`error: ${job.error}`);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    }
  })();
  return { job };
}

/** True (and logged) when a scheduled post is waiting for this account's browser. */
function yieldToPosts(job: UnfollowJob, record: (line: string) => void): boolean {
  if (!postWaitingForBrowser("twitter", job.accountId)) return false;
  record("Stopping early so a scheduled post can go out. Run it again to carry on.");
  return true;
}

export async function startScan(accountId: string): Promise<Result> {
  const account = await findAccount(accountId);
  if (!account) return { error: "Account not found." };
  return run("scan", account, 0, async (page, job, record) => {
    record(`Reading who @${account.handle} follows…`);
    const scan = await scanFollowing(page, account.id, account.handle, record);
    const now = new Date().toISOString();
    await modifyUnfollowData(account.id, (data) => {
      // Keep activity checks from earlier scans.
      const previous = new Map(data.following.map((a) => [a.handle.toLowerCase(), a]));
      const following = scan.accounts.map((a) => {
        const before = previous.get(a.handle.toLowerCase());
        return before ? { ...a, lastPostAt: before.lastPostAt, activityCheckedAt: before.activityCheckedAt } : a;
      });
      return { ...data, following, scannedAt: now, hasStats: scan.hasStats, partial: scan.partial };
    });
    job.done = scan.accounts.length;
    if (scan.partial) return;

    record("Reading who interacts with you…");
    const interacted = await scanInteractions(page, account.handle, record);
    await modifyUnfollowData(account.id, (data) => {
      const cutoff = Date.now() - INTERACTION_WINDOW_DAYS * DAY_MS;
      const interactions = Object.fromEntries(
        Object.entries(data.interactions).filter(([, at]) => new Date(at).getTime() >= cutoff),
      );
      for (const h of interacted) interactions[h] = now;
      return { ...data, interactions, interactionsScannedAt: now };
    });
    record("Scan finished.");
  });
}

export async function startActivityCheck(accountId: string, handles: string[]): Promise<Result> {
  const account = await findAccount(accountId);
  if (!account) return { error: "Account not found." };
  const data = await getUnfollowData(account.id);
  const byHandle = new Map(data.following.map((a) => [a.handle.toLowerCase(), a]));
  const targets = handles.map((h) => byHandle.get(h.toLowerCase())).filter((a) => a !== undefined);
  if (targets.length === 0) return { error: "Pick accounts from your last scan." };
  if (targets.length > MAX_ACTIVITY_CHECKS_PER_RUN) {
    return { error: `Check up to ${MAX_ACTIVITY_CHECKS_PER_RUN} accounts at a time.` };
  }

  return run("activity", account, targets.length, async (page, job, record) => {
    for (const target of targets) {
      if (yieldToPosts(job, record)) return;
      let at = await lastPostedAt(page, target.handle, target.id);
      // An empty timeline on an account X says has posts: suspended or blocked, not "never posted".
      if (at === null && (target.posts ?? 0) > 0) at = undefined;
      if (at === undefined) {
        job.failed++;
        record(`@${target.handle}: couldn't tell`);
      } else {
        job.done++;
        record(`@${target.handle}: ${at ? `last posted ${at.slice(0, 10)}` : "no posts"}`);
        const key = target.handle.toLowerCase();
        const checkedAt = new Date().toISOString();
        await modifyUnfollowData(account.id, (d) => ({
          ...d,
          following: d.following.map((a) =>
            a.handle.toLowerCase() === key ? { ...a, lastPostAt: at, activityCheckedAt: checkedAt } : a,
          ),
        }));
      }
      await jitter(1500, 3500);
    }
    record(`Checked ${job.done}, couldn't tell for ${job.failed}.`);
  });
}

export async function startUnfollow(accountId: string, handles: string[], rules: UnfollowRules): Promise<Result> {
  const account = await findAccount(accountId);
  if (!account) return { error: "Account not found." };
  const data = await getUnfollowData(account.id);
  if (handles.length === 0) return { error: "Tick the accounts to unfollow." };
  if (handles.length > MAX_UNFOLLOWS_PER_RUN) {
    return { error: `Unfollow up to ${MAX_UNFOLLOWS_PER_RUN} at a time. X locks accounts that unfollow too fast.` };
  }
  const dayAgo = Date.now() - DAY_MS;
  const today = data.history.filter((c) => c.action === "unfollowed" && new Date(c.at).getTime() > dayAgo).length;
  if (today + handles.length > MAX_UNFOLLOWS_PER_DAY) {
    return {
      error: `That would be more than ${MAX_UNFOLLOWS_PER_DAY} unfollows in 24 hours (${today} so far). X locks accounts past its limits, so try again later.`,
    };
  }

  // Only accounts from the scan, and never protected ones, whatever the page sent.
  const ctx = await unfollowContext(data);
  const byHandle = new Map(data.following.map((a) => [a.handle.toLowerCase(), a]));
  const targets: { account: UnfollowData["following"][number]; reasons: string[] }[] = [];
  for (const h of handles) {
    const target = byHandle.get(h.toLowerCase());
    if (!target) return { error: `@${h} isn't in your last scan. Scan again.` };
    const protectedBecause = protectionReason(target, rules, ctx);
    if (protectedBecause) return { error: `@${target.handle} is protected (${protectedBecause}).` };
    targets.push({ account: target, reasons: unfollowReasons(target, rules, ctx) });
  }

  return run("unfollow", account, targets.length, async (page, job, record) => {
    let failuresInARow = 0;
    for (const { account: target, reasons } of targets) {
      if (yieldToPosts(job, record)) return;
      const result = await setFollowing(page, target.handle, target.id, false);
      if (result.ok) {
        failuresInARow = 0;
        job.done++;
        record(`Unfollowed @${target.handle}`);
        const change: FollowChange = {
          handle: target.handle,
          name: target.name,
          userId: target.id,
          action: "unfollowed",
          at: new Date().toISOString(),
          reasons,
        };
        const key = target.handle.toLowerCase();
        await modifyUnfollowData(account.id, (d) => ({
          ...d,
          following: d.following.filter((a) => a.handle.toLowerCase() !== key),
          history: [...d.history, change].slice(-MAX_HISTORY),
        }));
      } else {
        failuresInARow++;
        job.failed++;
        record(`Skipped @${target.handle}: ${result.reason}`);
        if (failuresInARow >= 3) {
          record("Stopping after 3 failures in a row. X may be limiting this account; try again later.");
          return;
        }
      }
      // A person's pace, not a script's.
      await jitter(4000, 9000);
    }
    record(`Done. Unfollowed ${job.done}${job.failed ? `, skipped ${job.failed}` : ""}.`);
  });
}

export async function startRefollow(accountId: string, handles: string[]): Promise<Result> {
  const account = await findAccount(accountId);
  if (!account) return { error: "Account not found." };
  const data = await getUnfollowData(account.id);
  const targets: FollowChange[] = [];
  for (const h of handles) {
    const last = data.history.findLast((c) => c.handle.toLowerCase() === h.toLowerCase());
    if (last?.action !== "unfollowed") return { error: `@${h} wasn't unfollowed here.` };
    targets.push(last);
  }
  if (targets.length === 0) return { error: "Pick who to follow again." };
  if (targets.length > MAX_UNFOLLOWS_PER_RUN) return { error: `Follow up to ${MAX_UNFOLLOWS_PER_RUN} at a time.` };

  return run("refollow", account, targets.length, async (page, job, record) => {
    for (const target of targets) {
      if (yieldToPosts(job, record)) return;
      const result = await setFollowing(page, target.handle, target.userId, true);
      if (result.ok) {
        job.done++;
        record(`Following @${target.handle} again`);
        const key = target.handle.toLowerCase();
        // Unfollowed by mistake, so keep them from now on.
        await modifyUnfollowData(account.id, (d) => ({
          ...d,
          keep: d.keep.includes(key) ? d.keep : [...d.keep, key],
          history: [...d.history, { ...target, action: "refollowed" as const, at: new Date().toISOString() }].slice(-MAX_HISTORY),
        }));
      } else {
        job.failed++;
        record(`Skipped @${target.handle}: ${result.reason}`);
      }
      await jitter(4000, 9000);
    }
    record(`Done. Following ${job.done} again. They're on your keep list; they show in the list after the next scan.`);
  });
}

/** Adds or removes a handle from the keep list. */
export async function setKept(accountId: string, handle: string, keep: boolean): Promise<UnfollowData> {
  const key = handle.toLowerCase();
  return modifyUnfollowData(accountId, (d) => ({
    ...d,
    keep: keep ? (d.keep.includes(key) ? d.keep : [...d.keep, key]) : d.keep.filter((h) => h !== key),
  }));
}
