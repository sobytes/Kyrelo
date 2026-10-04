// Threads through Meta's official API (graph.threads.net). Meta has no
// sign-in an open-source desktop app can share, so the user pastes a
// long-lived access token from their own Meta developer app (the Accounts
// section walks through it). Tokens last 60 days; Kyrelo refreshes them
// whenever it uses them, so an account in use doesn't expire.
//
// Text only: the API takes images from a public web address, and Kyrelo's
// images stay on this computer.

import { getAccountSecret, setAccountSecret } from "./storage";

const API = "https://graph.threads.net/v1.0";
const TIMEOUT_MS = 30_000;
/** Refresh a token older than this (it lasts 60 days; a refresh needs it at least a day old). */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

async function api<T>(url: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Threads: ${json.error?.message ?? `HTTP ${res.status}`}`);
  return json;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** The account a token belongs to. Throws with Meta's reason if the token is refused. */
export function verifyToken(token: string): Promise<{ id: string; username: string }> {
  return api(`${API}/me?${q({ fields: "id,username", access_token: token })}`);
}

/** A fresh long-lived token, when this one is due for it; otherwise null. */
export async function refreshedToken(token: string, refreshedAt: string | undefined, now = Date.now()): Promise<string | null> {
  if (refreshedAt && now - new Date(refreshedAt).getTime() < REFRESH_AFTER_MS) return null;
  const { access_token } = await api<{ access_token: string }>(
    `https://graph.threads.net/refresh_access_token?${q({ grant_type: "th_refresh_token", access_token: token })}`,
  );
  return access_token;
}

/**
 * The account's Threads id and a working token. Tokens last 60 days;
 * renewing one in use keeps the account connected.
 */
export async function threadsCredentials(accountId: string): Promise<{ userId: string; token: string }> {
  const secret = await getAccountSecret("threads", accountId);
  if (!secret?.token || !secret.userId) throw new Error("This Threads account isn't signed in any more. Reconnect it under Accounts.");
  const fresh = await refreshedToken(secret.token, secret.refreshedAt).catch(() => null);
  if (!fresh) return { userId: secret.userId, token: secret.token };
  await setAccountSecret("threads", accountId, { ...secret, token: fresh, refreshedAt: new Date().toISOString() });
  return { userId: secret.userId, token: fresh };
}

/**
 * Posts `text` and returns the post's URL. Threads publishes in two steps:
 * create a container, then publish it. A just-created container can take a
 * moment to be ready, so publishing is retried briefly. `replyToId` makes it
 * a reply to that post or comment.
 */
export async function postToThreads(userId: string, token: string, text: string, replyToId?: string): Promise<{ url: string }> {
  const { id: container } = await api<{ id: string }>(
    `${API}/${userId}/threads?${q({ media_type: "TEXT", text, access_token: token, ...(replyToId ? { reply_to_id: replyToId } : {}) })}`,
    "POST",
  );
  let published: { id: string } | undefined;
  for (let attempt = 0; !published; attempt++) {
    try {
      published = await api<{ id: string }>(`${API}/${userId}/threads_publish?${q({ creation_id: container, access_token: token })}`, "POST");
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const { permalink } = await api<{ permalink?: string }>(
    `${API}/${published.id}?${q({ fields: "permalink", access_token: token })}`,
  ).catch(() => ({ permalink: undefined }));
  return { url: permalink ?? "https://www.threads.net/" };
}

/** A reply someone left on one of your posts. */
export interface ThreadsComment {
  id: string;
  username: string;
  text: string;
  url: string;
  postedAt: string;
  /** Your post it replies to. */
  postText: string;
}

export const THREADS_RECONNECT =
  "Kyrelo can't read this account's comments. Make a new token with the threads_read_replies and threads_manage_replies permissions too, and reconnect under Accounts.";

/** Comments are read from posts this recent; older ones rarely get new ones. */
const COMMENT_POSTS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The comments on your posts from the last week. Threads has no
 * notifications API, so each recent post's replies are read in turn.
 */
export async function listThreadsComments(userId: string, username: string, token: string, now = Date.now()): Promise<ThreadsComment[]> {
  const { data: posts } = await api<{ data: { id: string; text?: string; timestamp: string }[] }>(
    `${API}/${userId}/threads?${q({ fields: "id,text,timestamp", limit: "10", access_token: token })}`,
  );
  const recent = posts.filter((p) => now - new Date(p.timestamp).getTime() <= COMMENT_POSTS_MAX_AGE_MS);
  const comments: ThreadsComment[] = [];
  for (const post of recent) {
    let replies;
    try {
      ({ data: replies } = await api<{ data: { id: string; text?: string; username?: string; timestamp: string; permalink?: string }[] }>(
        `${API}/${post.id}/replies?${q({ fields: "id,text,username,timestamp,permalink", access_token: token })}`,
      ));
    } catch (err) {
      // Tokens made only for posting lack threads_read_replies.
      if (/permission/i.test(String(err))) throw new Error(THREADS_RECONNECT);
      throw err;
    }
    for (const r of replies) {
      if (!r.username || r.username.toLowerCase() === username.toLowerCase()) continue;
      comments.push({
        id: r.id,
        username: r.username,
        text: r.text ?? "",
        url: r.permalink ?? "https://www.threads.net/",
        postedAt: r.timestamp,
        postText: post.text ?? "",
      });
    }
  }
  return comments;
}
