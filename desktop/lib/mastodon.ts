import { promises as fs } from "node:fs";
import path from "node:path";
import { imageTypeForFilename } from "./uploads";

// Mastodon through its public API. Connecting is the standard OAuth flow for
// desktop apps, so the user only types their server: Kyrelo registers itself
// with that server, the browser shows "Authorize Kyrelo?", and the server
// redirects back to Kyrelo on this computer with a code
// (/api/accounts/mastodon/callback) that becomes the access token.

const TIMEOUT_MS = 30_000;
// read:notifications and read:statuses are for Comments. Accounts connected
// before it don't have them and must reconnect (see MASTODON_RECONNECT).
export const MASTODON_SCOPES = "read:accounts read:notifications read:statuses write:statuses write:media";

/** "mastodon.social", "@me@mastodon.social" or a full URL → "https://mastodon.social". */
export function normalizeInstance(input: string): string | null {
  const host = input
    .trim()
    .replace(/^@?[^@\s/]+@(?=[^@]+$)/, "") // @user@server → server
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/.test(host) ? `https://${host}` : null;
}

async function api<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`Mastodon: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`);
  return json;
}

/** Registers Kyrelo as an app on the server, for this redirect. */
export function registerApp(instance: string, redirectUri: string): Promise<{ client_id: string; client_secret: string }> {
  return api(`${instance}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Kyrelo",
      redirect_uris: redirectUri,
      scopes: MASTODON_SCOPES,
      website: "https://kyrelo.com",
    }),
  });
}

export function authorizeUrl(instance: string, clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: MASTODON_SCOPES, state });
  return `${instance}/oauth/authorize?${q}`;
}

export async function exchangeCode(
  instance: string,
  app: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
): Promise<string> {
  const { access_token } = await api<{ access_token: string }>(`${instance}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
      scope: MASTODON_SCOPES,
    }),
  });
  return access_token;
}

/** The signed-in account: its username (acct) on this server. */
export function verifyCredentials(instance: string, token: string): Promise<{ id: string; acct: string; username: string }> {
  return api(`${instance}/api/v1/accounts/verify_credentials`, { token });
}

/**
 * Posts `text` (and an optional image) and returns the post's URL. Images
 * upload first; the server may process them in the background, so their id
 * is attached once they're ready. `idempotencyKey` (the scheduled post's id)
 * makes the server ignore a repeat of the same post within the hour.
 */
export async function postToMastodon(
  instance: string,
  token: string,
  text: string,
  opts: { imagePath?: string; idempotencyKey: string },
): Promise<{ url: string }> {
  const { imagePath } = opts;
  const mediaIds: string[] = [];
  if (imagePath) {
    const data = await fs.readFile(imagePath);
    const form = new FormData();
    const type = imageTypeForFilename(path.basename(imagePath)) ?? "image/png";
    form.append("file", new Blob([new Uint8Array(data)], { type }), path.basename(imagePath));
    let media = await api<{ id: string; url: string | null }>(`${instance}/api/v2/media`, { method: "POST", body: form, token });
    for (let i = 0; i < 15 && !media.url; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      media = await api(`${instance}/api/v1/media/${media.id}`, { token });
    }
    if (!media.url) throw new Error("Mastodon: the image is still processing. Try again in a minute.");
    mediaIds.push(media.id);
  }
  const status = await api<{ url: string }>(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": opts.idempotencyKey },
    body: JSON.stringify({ status: text, media_ids: mediaIds }),
    token,
  });
  return { url: status.url };
}

/** A reply someone left on one of your posts. */
export interface MastodonComment {
  id: string;
  /** Who wrote it, as @user@server (or @user on your own server). */
  acct: string;
  text: string;
  url: string;
  postedAt: string;
  /** A reply goes out with the same visibility, so a followers-only comment doesn't get a public answer. */
  visibility: "public" | "unlisted" | "private";
  /** Your post it replies to. */
  postText: string;
}

export const MASTODON_RECONNECT = "Reconnect this Mastodon account under Accounts so Kyrelo can read comments.";

interface Status {
  id: string;
  content: string;
  url: string;
  created_at: string;
  visibility: string;
  in_reply_to_id: string | null;
  in_reply_to_account_id: string | null;
}

/** Mastodon sends posts as HTML: paragraphs and line breaks become newlines, tags and entities go. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** The newest replies to your posts, from your mentions. Direct messages are left out. */
export async function listMastodonComments(instance: string, token: string): Promise<MastodonComment[]> {
  let mentions: { status?: Status; account: { id: string; acct: string } }[];
  let me: { id: string };
  try {
    me = await verifyCredentials(instance, token);
    mentions = await api(`${instance}/api/v1/notifications?types[]=mention&limit=40`, { token });
  } catch (err) {
    // Tokens from before Comments lack the read scopes.
    if (/scope|forbidden|403/i.test(String(err))) throw new Error(MASTODON_RECONNECT);
    throw err;
  }
  const replies = mentions.filter(
    (m): m is typeof m & { status: Status } =>
      Boolean(m.status) &&
      m.status!.in_reply_to_account_id === me.id &&
      m.account.id !== me.id &&
      m.status!.visibility !== "direct",
  );
  const parents = new Map<string, string>();
  for (const id of new Set(replies.map((m) => m.status.in_reply_to_id!))) {
    const parent = await api<Status>(`${instance}/api/v1/statuses/${id}`, { token }).catch(() => null);
    if (parent) parents.set(id, htmlToText(parent.content));
  }
  return replies
    .filter((m) => parents.has(m.status.in_reply_to_id!))
    .map(({ status, account }) => ({
      id: status.id,
      acct: account.acct,
      text: htmlToText(status.content),
      url: status.url,
      postedAt: status.created_at,
      visibility: status.visibility as MastodonComment["visibility"],
      postText: parents.get(status.in_reply_to_id!)!,
    }));
}

/**
 * Replies to a comment and returns the reply's URL. Mastodon only notifies
 * people named in a post, so the reply starts with the commenter's @handle,
 * as Mastodon's own apps do.
 */
export async function replyOnMastodon(
  instance: string,
  token: string,
  comment: Pick<MastodonComment, "id" | "acct" | "visibility">,
  text: string,
): Promise<{ url: string }> {
  const mention = `@${comment.acct}`;
  const status = text.toLowerCase().startsWith(mention.toLowerCase()) ? text : `${mention} ${text}`;
  const reply = await api<{ url: string }>(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `reply-${comment.id}` },
    body: JSON.stringify({ status, in_reply_to_id: comment.id, visibility: comment.visibility }),
    token,
  });
  return { url: reply.url };
}
