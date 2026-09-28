import { generateGrokQuestion } from "./ai";
import { getGrokSettings, getGrokState, modifyGrokState } from "./storage";
import { defaultXAccountId } from "./accounts";
import { connectingPlatform } from "./browser-connect";
import { SeenTweet } from "./types";

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

  return {
    seen: scraped.length,
    // The worker pops a native notification for each of these, so honour the
    // Settings toggle here (it's the only place the worker learns of it).
    newTweets: settings.notifyDesktop ? newTweets : [],
  };
}

export interface ReplyOutcome {
  tweetId: string;
  ok: boolean;
  reply?: string;
  error?: string;
}

export async function generateReplyForTweet(tweetId: string): Promise<ReplyOutcome> {
  const settings = await getGrokSettings();
  const state = await getGrokState();
  const tweet = state.tweets.find((t) => t.id === tweetId);
  if (!tweet) return { tweetId, ok: false, error: "tweet not in state" };
  try {
    const reply = await generateGrokQuestion({
      tweetText: tweet.text,
      styleHint: settings.styleHint,
      provider: settings.aiProvider,
    });
    return { tweetId, ok: true, reply };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { tweetId, ok: false, error: message };
  }
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
