// Threads through Meta's official API (graph.threads.net). Meta has no
// sign-in an open-source desktop app can share, so the user pastes a
// long-lived access token from their own Meta developer app (the Accounts
// section walks through it). Tokens last 60 days; Kyrelo refreshes them
// when posting, so an account in use doesn't expire.
//
// Text only: the API takes images from a public web address, and Kyrelo's
// images stay on this computer.

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
 * Posts `text` and returns the post's URL. Threads publishes in two steps:
 * create a container, then publish it. A just-created container can take a
 * moment to be ready, so publishing is retried briefly.
 */
export async function postToThreads(userId: string, token: string, text: string): Promise<{ url: string }> {
  const { id: container } = await api<{ id: string }>(
    `${API}/${userId}/threads?${q({ media_type: "TEXT", text, access_token: token })}`,
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
