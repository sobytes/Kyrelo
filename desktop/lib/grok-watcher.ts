import { aiErrorMessage, draftReplies } from "./ai";
import { getGrokSettings, getGrokState, modifyGrokState } from "./storage";
import { defaultXAccountId } from "./accounts";
import { connectingPlatform } from "./browser-connect";
import { ReplyDraft, SeenTweet } from "./types";

function mergeSeen(existing: SeenTweet[], fresh: SeenTweet[]): SeenTweet[] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const f of fresh) {
    const prev = byId.get(f.id);
    if (prev) {
      // Keep existing state but refresh postedAt and handle if newly available.
      if (!prev.postedAt && f.postedAt) prev.postedAt = f.postedAt;
      if (!prev.handle && f.handle) prev.handle = f.handle;
    } else {
      byId.set(f.id, f);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.seenAt.localeCompare(b.seenAt));
}

export interface NotifyTweet {
  id: string;
  handle: string;
  url: string;
  text: string;
  isReply: boolean;
}

export interface WatchResult {
  skipped?: string;
  error?: string;
  seen?: number;
  newTweets?: NotifyTweet[];
}

// One scrape at a time in this process. The worker already avoids overlap,
// but the Monitor page's manual run hits the same code path.
const watcherState = ((globalThis as { __kyreloWatcher?: { running: boolean; offset: number } })
  .__kyreloWatcher ??= { running: false, offset: 0 });

export async function runGrokWatcher(): Promise<WatchResult> {
  if (watcherState.running) return { skipped: "busy" };
  watcherState.running = true;
  try {
    return await runGrokWatcherOnce();
  } finally {
    watcherState.running = false;
  }
}

async function runGrokWatcherOnce(): Promise<WatchResult> {
  const settings = await getGrokSettings();
  if (!settings.enabled) return { skipped: "disabled" };
  if (connectingPlatform()) return { skipped: "connecting" };
  const accountId = await defaultXAccountId();
  if (!accountId) return { skipped: "no-account" };
  const all = settings.handles.filter(Boolean);
  if (all.length === 0) return { skipped: "no-handles" };
  // Start from a different handle each tick. A scrape can stop early to let a
  // scheduled post through, and rotating keeps the later handles from being
  // skipped every time.
  const start = watcherState.offset++ % all.length;
  const handles = [...all.slice(start), ...all.slice(0, start)];

  const { scrapeManyTimelines } = await import("./browser/twitter-watch");

  const now = new Date();

  let scraped;
  try {
    scraped = await scrapeManyTimelines({
      accountId,
      handles,
      includeReplies: settings.includeReplies,
      limit: 12,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `scrape failed: ${message}` };
  }

  // The scrape can take minutes. Settings may have changed meanwhile (a
  // handle removed resets the feed), so keep only still-watched handles.
  const watched = new Set((await getGrokSettings()).handles.map((h) => h.toLowerCase()));
  const fresh: SeenTweet[] = scraped
    .filter((t) => watched.has(t.handle.toLowerCase()))
    .map((t) => ({
      id: t.id,
      handle: t.handle,
      text: t.text,
      url: t.url,
      isReply: t.isReply,
      postedAt: t.postedAt,
      seenAt: now.toISOString(),
    }));

  let newTweets: NotifyTweet[] = [];
  // Merge into the latest stored state, not a copy read before the scrape,
  // so replies marked and resets made during the scrape are kept.
  await modifyGrokState((state) => {
    const existingIds = new Set(state.tweets.map((t) => t.id));
    const merged = mergeSeen(state.tweets, fresh);

    // "Too old" guard for bootstrap: tweets posted before today minus
    // (notifyWindowMin) shouldn't surface as notifications. We use the real
    // postedAt from <time datetime>. This protects against time-traveling
    // when first enabling a handle.
    const notifyWindowMin = 60; // tweets older than 1 hour at first-sight are skipped
    for (const t of merged) {
      if (t.skipped || t.repliedAt) continue;
      if (!t.postedAt) continue;
      const ageMin = (now.getTime() - new Date(t.postedAt).getTime()) / 60_000;
      // Only mark as too-old if this is the FIRST time we see it AND it's already old.
      if (!existingIds.has(t.id) && ageMin > notifyWindowMin) {
        t.skipped = "too-old";
      }
    }

    // The "new tweets" worth notifying on: ones we hadn't seen before this tick
    // and that weren't marked too-old at first sight.
    newTweets = merged
      .filter((t) => !existingIds.has(t.id) && !t.skipped)
      .map((t) => ({
        id: t.id,
        handle: t.handle,
        url: t.url,
        text: t.text,
        isReply: t.isReply,
      }));

    return {
      bootstrapped: true,
      lastCheckedAt: now.toISOString(),
      tweets: merged,
    };
  });

  // The browser is closed by now, so drafting never delays a scheduled post.
  if (settings.autopilot.enabled) await runAutopilot();

  return {
    seen: scraped.length,
    // The worker pops a native notification for each of these, so honour the
    // Settings toggle here (it's the only place the worker learns of it).
    newTweets: settings.notifyDesktop ? newTweets : [],
  };
}

// Drafts per check. Each is one AI call; the rest are picked up next check.
const AUTOPILOT_MAX_PER_CHECK = 5;
// Replies to older tweets are rarely seen, so don't spend AI calls on them.
const AUTOPILOT_MAX_AGE_MS = 60 * 60_000;

/** Drafts replies for recent tweets that don't have a draft yet, newest first. */
async function runAutopilot(): Promise<void> {
  const { minScore } = (await getGrokSettings()).autopilot;
  const now = Date.now();
  const candidates = (await getGrokState()).tweets
    .filter((t) => !t.draft && !t.repliedAt && !t.skipped)
    .filter((t) => now - new Date(t.postedAt ?? t.seenAt).getTime() <= AUTOPILOT_MAX_AGE_MS)
    .sort((a, b) => (b.postedAt ?? b.seenAt).localeCompare(a.postedAt ?? a.seenAt))
    .slice(0, AUTOPILOT_MAX_PER_CHECK);
  for (const t of candidates) {
    const r = await draftForTweet(t.id, minScore);
    if (r.error) {
      // No draft is saved, so it's retried next check. Stop now: the same
      // problem (no API key, provider down) would fail every tweet.
      console.warn(`[autopilot] drafting failed for ${t.id}: ${r.error}`);
      return;
    }
  }
  if (candidates.length) console.log(`[autopilot] drafted replies for ${candidates.length} tweet(s)`);
}

/**
 * Asks the AI to judge a tweet and draft replies, and stores the result on the
 * tweet. `threshold` 0 always drafts (the user asked for replies); autopilot
 * passes the user's minimum score.
 */
export async function draftForTweet(
  tweetId: string,
  threshold: number,
): Promise<{ draft?: ReplyDraft; error?: string }> {
  const settings = await getGrokSettings();
  const tweet = (await getGrokState()).tweets.find((t) => t.id === tweetId);
  if (!tweet) return { error: "tweet not in state" };
  let draft: ReplyDraft;
  try {
    const r = await draftReplies({
      tweet,
      autopilot: settings.autopilot,
      voiceNotes: settings.styleHint,
      threshold,
      provider: settings.aiProvider,
    });
    draft = { ...r, generatedAt: new Date().toISOString() };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
  await modifyGrokState((state) => ({
    ...state,
    tweets: state.tweets.map((t) => (t.id === tweetId ? { ...t, draft } : t)),
  }));
  return { draft };
}

export async function markTweetReplied(
  tweetId: string,
  replyText: string,
): Promise<{ ok: boolean; error?: string }> {
  let found = false;
  await modifyGrokState((state) => ({
    ...state,
    tweets: state.tweets.map((t) => {
      if (t.id !== tweetId) return t;
      found = true;
      return { ...t, replyText, repliedAt: new Date().toISOString(), replyError: undefined };
    }),
  }));
  if (!found) return { ok: false, error: "tweet not in state" };
  return { ok: true };
}
