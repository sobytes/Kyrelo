import { getAccountSecret, listAccounts, listScheduledPosts, updateScheduledPost } from "./storage";
import { Account, PlatformId, PostStats, ScheduledPost } from "./types";

// How sent posts are doing: likes, reposts, replies and views, read from the
// platforms whose APIs share them. Each platform supplies one StatsSource,
// given the post's link; others (X through the browser, Threads without the
// insights permission, Telegram, Discord…) just don't show stats.

const TIMEOUT_MS = 30_000;
/** Posts older than this aren't refreshed: their numbers have settled. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
/** A post's stats are refreshed at most this often. */
const REFRESH_EVERY_MS = 60 * 60_000;

type StatsSource = (account: Account, url: string) => Promise<Omit<PostStats, "checkedAt"> | null>;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const SOURCES: Partial<Record<PlatformId, StatsSource>> = {
  // Bluesky's public AppView needs no sign-in: https://bsky.app/profile/<handle>/post/<rkey>.
  async bluesky(_account, url) {
    const m = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
    if (!m) return null;
    const api = "https://public.api.bsky.app/xrpc";
    const { did } = await getJson<{ did: string }>(`${api}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(m[1])}`);
    const { posts } = await getJson<{ posts: { likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }[] }>(
      `${api}/app.bsky.feed.getPosts?uris=${encodeURIComponent(`at://${did}/app.bsky.feed.post/${m[2]}`)}`,
    );
    const p = posts[0];
    return p ? { likes: p.likeCount ?? 0, reposts: (p.repostCount ?? 0) + (p.quoteCount ?? 0), replies: p.replyCount ?? 0 } : null;
  },
  // https://<server>/@user/<id>, looked up on the account's own server.
  async mastodon(account, url) {
    const id = url.match(/\/(\d+)\/?$/)?.[1];
    const secret = await getAccountSecret("mastodon", account.id);
    if (!id || !secret?.instance || !secret.token) return null;
    const s = await getJson<{ favourites_count: number; reblogs_count: number; replies_count: number }>(
      `${secret.instance}/api/v1/statuses/${id}`,
      { Authorization: `Bearer ${secret.token}` },
    );
    return { likes: s.favourites_count, reposts: s.reblogs_count, replies: s.replies_count };
  },
  async youtube(account, url) {
    const id = url.match(/[?&]v=([\w-]+)/)?.[1];
    const secret = await getAccountSecret("youtube", account.id);
    if (!id || !secret?.token || !secret.clientId || !secret.clientSecret) return null;
    const { accessToken } = await import("./youtube");
    const token = await accessToken({ clientId: secret.clientId, clientSecret: secret.clientSecret }, secret.token);
    const { items } = await getJson<{ items?: { statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}`,
      { Authorization: `Bearer ${token}` },
    );
    const s = items?.[0]?.statistics;
    return s ? { views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), replies: Number(s.commentCount ?? 0) } : null;
  },
  // Pages with an API token: https://www.facebook.com/<pageId>_<postId>.
  async facebook(account, url) {
    const id = url.match(/facebook\.com\/(\d+_\d+)/)?.[1];
    const secret = await getAccountSecret("facebook", account.id);
    if (!id || !secret?.token) return null;
    const p = await getJson<{ reactions?: { summary?: { total_count: number } }; comments?: { summary?: { total_count: number } }; shares?: { count: number } }>(
      `https://graph.facebook.com/v23.0/${id}?fields=reactions.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(secret.token)}`,
    );
    return { likes: p.reactions?.summary?.total_count ?? 0, replies: p.comments?.summary?.total_count ?? 0, reposts: p.shares?.count ?? 0 };
  },
  // https://dev.to/<user>/<slug>: DEV's public article API.
  async devto(_account, url) {
    const m = url.match(/dev\.to\/([^/]+)\/([^/?#]+)/);
    if (!m) return null;
    const a = await getJson<{ public_reactions_count: number; comments_count: number }>(`https://dev.to/api/articles/${m[1]}/${m[2]}`);
    return { likes: a.public_reactions_count, replies: a.comments_count };
  },
  // https://<instance>/post/<id>: Lemmy's public post API.
  async lemmy(_account, url) {
    const m = url.match(/^(https:\/\/[^/]+)\/post\/(\d+)/);
    if (!m) return null;
    const { post_view } = await getJson<{ post_view: { counts: { score: number; comments: number } } }>(
      `${m[1]}/api/v3/post?id=${m[2]}`,
    );
    return { likes: post_view.counts.score, replies: post_view.counts.comments };
  },
};

export function hasStats(platform: PlatformId): boolean {
  return Boolean(SOURCES[platform]);
}

// One refresh at a time, shared by the worker and the Scheduler's button.
const refreshState = ((globalThis as { __kyreloStats?: { inFlight?: Promise<{ updated: number }> } }).__kyreloStats ??= {});

/** Refreshes the stats of sent posts from the last month that are due for it (or all of them, when `force`). */
export function refreshStats(opts: { force?: boolean } = {}): Promise<{ updated: number }> {
  refreshState.inFlight ??= refreshOnce(opts.force ?? false).finally(() => {
    refreshState.inFlight = undefined;
  });
  return refreshState.inFlight;
}

async function refreshOnce(force: boolean): Promise<{ updated: number }> {
  const now = Date.now();
  const accounts = await listAccounts();
  const due = (await listScheduledPosts()).filter(
    (p): p is ScheduledPost & { postedUrl: string } =>
      p.status === "posted" &&
      Boolean(p.postedUrl) &&
      hasStats(p.platform) &&
      now - new Date(p.postedAt ?? p.scheduledFor).getTime() < MAX_AGE_MS &&
      (force || !p.stats || now - new Date(p.stats.checkedAt).getTime() > REFRESH_EVERY_MS),
  );
  let updated = 0;
  for (const post of due) {
    const account = accounts.find((a) => a.platform === post.platform && a.id === post.accountId);
    if (!account) continue;
    try {
      const stats = await SOURCES[post.platform]!(account, post.postedUrl);
      if (!stats) continue;
      await updateScheduledPost(post.id, (latest) => ({ ...latest, stats: { ...stats, checkedAt: new Date().toISOString() } }));
      updated++;
    } catch (err) {
      // A deleted post or a hiccup: keep the last numbers and try next time.
      console.warn(`[stats] ${post.platform} ${post.postedUrl}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { updated };
}
