import path from "node:path";
import {
  deleteScheduledPost,
  getGrokSettings,
  insertScheduledPost,
  listScheduledPosts,
  listXAccounts,
  updateScheduledPost,
} from "./storage";
import { getDefaultAccountId, isConnectActive } from "./twitter-connect";
import { ScheduledPost } from "./types";
import { uploadsDir } from "./uploads";

export interface DispatchOutcome {
  ran: number;
  posted: number;
  failed: number;
  skipped?: string;
}

// One dispatch run at a time in this process, like the watcher's guard. The
// worker skips overlapping ticks, but its flag resets when fetch gives up at
// 300s; a second run would then treat the post still being sent as stale.
const dispatchState = ((globalThis as { __kyreloDispatch?: { running: boolean } }).__kyreloDispatch ??= {
  running: false,
});

export async function runDueScheduledPosts(): Promise<DispatchOutcome> {
  if (dispatchState.running) return { ran: 0, posted: 0, failed: 0, skipped: "busy" };
  dispatchState.running = true;
  try {
    return await dispatchDuePosts();
  } finally {
    dispatchState.running = false;
  }
}

async function dispatchDuePosts(): Promise<DispatchOutcome> {
  if (isConnectActive()) return { ran: 0, posted: 0, failed: 0, skipped: "connecting" };

  const all = await listScheduledPosts();
  const now = Date.now();

  // Recover posts orphaned at "posting" — the app closed (or crashed) mid-send,
  // leaving the record stuck forever, since the dispatch loop below only picks
  // up "pending". A real send finishes within a couple minutes of its
  // scheduled time, so anything still "posting" well past that is stale. Mark
  // it failed (not pending) — the original send may have gone through, so don't
  // auto-retry; the user can reschedule from History.
  const STALE_POSTING_MS = 10 * 60_000;
  for (const p of all) {
    if (
      p.status === "posting" &&
      now - new Date(p.scheduledFor).getTime() > STALE_POSTING_MS
    ) {
      await updateScheduledPost(p.id, (latest) =>
        latest.status === "posting"
          ? {
              ...latest,
              status: "failed",
              error:
                "Posting was interrupted — the app closed mid-send. Reschedule if it didn't go out.",
            }
          : null,
      );
    }
  }

  const due = all.filter(
    (p) => p.status === "pending" && new Date(p.scheduledFor).getTime() <= now,
  );
  if (due.length === 0) return { ran: 0, posted: 0, failed: 0 };
  console.log(`[scheduler] dispatching ${due.length} due post(s)`);

  const accounts = await listXAccounts();
  const accountIds = new Set(accounts.map((a) => a.id));
  if (accountIds.size === 0) {
    return { ran: 0, posted: 0, failed: 0, skipped: "no-account" };
  }

  const { postTweetBrowser } = await import("./browser/twitter-post");
  const fallback = await getDefaultAccountId();
  const settings = await getGrokSettings();
  const headless = settings.headlessPosting ?? false;

  let posted = 0;
  let failed = 0;
  for (const candidate of due) {
    // Claim the post from its latest stored copy. The user may have edited,
    // rescheduled or cancelled it since `due` was read; only a post that is
    // still pending and due gets marked "posting", so it can't be sent twice.
    const post = await updateScheduledPost(candidate.id, (latest) =>
      latest.status === "pending" && new Date(latest.scheduledFor).getTime() <= Date.now()
        ? { ...latest, status: "posting" }
        : null,
    );
    if (!post) continue;

    const accountId = post.accountId && accountIds.has(post.accountId)
      ? post.accountId
      : fallback;
    if (!accountId) {
      await updateScheduledPost(post.id, (latest) => ({
        ...latest,
        status: "failed",
        error: "No connected X account for this post.",
      }));
      failed++;
      continue;
    }
    console.log(`[scheduler] posting id=${post.id} via account=${accountId}`);
    // Result updates go through updateScheduledPost, which does nothing if
    // the user cancelled (deleted) the post mid-send, so it doesn't come back.
    try {
      const imagePath = post.imagePath ? path.join(uploadsDir(), post.imagePath) : undefined;
      const r = await postTweetBrowser(accountId, post.text, {
        headless,
        imagePath,
        onBrowserReady: () =>
          updateScheduledPost(post.id, (latest) => ({ ...latest, sendingStartedAt: new Date().toISOString() })),
      });
      await updateScheduledPost(post.id, (latest) => ({
        ...latest,
        status: "posted",
        postedAt: new Date().toISOString(),
        postedUrl: r.url,
        error: undefined,
      }));
      posted++;
      console.log(`[scheduler] posted id=${post.id} → ${r.url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateScheduledPost(post.id, (latest) => ({ ...latest, status: "failed", error: msg }));
      failed++;
      console.error(`[scheduler] failed id=${post.id}: ${msg}`);
    }
  }

  return { ran: due.length, posted, failed };
}

export async function createScheduledPost(input: {
  platform: ScheduledPost["platform"];
  accountId: string;
  text: string;
  imagePath?: string;
  scheduledFor: string;
  campaignId?: string;
}): Promise<ScheduledPost> {
  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    platform: input.platform,
    accountId: input.accountId,
    text: input.text,
    imagePath: input.imagePath,
    scheduledFor: input.scheduledFor,
    createdAt: new Date().toISOString(),
    status: "pending",
    campaignId: input.campaignId,
  };
  await insertScheduledPost(post);
  return post;
}

export async function cancelScheduledPost(id: string): Promise<void> {
  await deleteScheduledPost(id);
}
