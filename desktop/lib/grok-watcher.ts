import { generateGrokQuestion } from "./ai";
import { getGrokSettings, getGrokState, saveGrokState } from "./storage";
import { getDefaultAccountId, isConnectActive } from "./twitter-connect";
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

export async function runGrokWatcher(): Promise<WatchResult> {
  const settings = await getGrokSettings();
  if (!settings.enabled) return { skipped: "disabled" };
  if (isConnectActive()) return { skipped: "connecting" };
  const accountId = await getDefaultAccountId();
  if (!accountId) return { skipped: "no-account" };
  const handles = settings.handles.filter(Boolean);
  if (handles.length === 0) return { skipped: "no-handles" };

  const { scrapeManyTimelines } = await import("./browser/twitter-watch");

  const now = new Date();
  const state = await getGrokState();
  const existingIds = new Set(state.tweets.map((t) => t.id));

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

  const fresh: SeenTweet[] = scraped.map((t) => ({
    id: t.id,
    handle: t.handle,
    text: t.text,
    url: t.url,
    isReply: t.isReply,
    postedAt: t.postedAt,
    seenAt: now.toISOString(),
  }));

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
  const newTweets: NotifyTweet[] = merged
    .filter((t) => !existingIds.has(t.id) && !t.skipped)
    .map((t) => ({
      id: t.id,
      handle: t.handle,
      url: t.url,
      text: t.text,
      isReply: t.isReply,
    }));

  await saveGrokState({
    bootstrapped: true,
    lastCheckedAt: now.toISOString(),
    tweets: merged,
  });

  return {
    seen: scraped.length,
    newTweets,
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
  const state = await getGrokState();
  const tweet = state.tweets.find((t) => t.id === tweetId);
  if (!tweet) return { ok: false, error: "tweet not in state" };
  tweet.replyText = replyText;
  tweet.repliedAt = new Date().toISOString();
  tweet.replyError = undefined;
  await saveGrokState(state);
  return { ok: true };
}
