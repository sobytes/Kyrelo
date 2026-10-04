// Comments on Instagram and Facebook through Meta's official Graph APIs, and
// posting to a Facebook Page when it has a token. Otherwise posting goes
// through the browser (lib/browser/*-post.ts);
// these APIs only cover professional accounts, so they're an add-on: the
// user pastes a token from their own Meta developer app on the Comments page,
// as with Threads, and Kyrelo uses it to read and answer comments.
//
// Instagram: a Business or Creator account, "Instagram API with Instagram
// login" (graph.instagram.com), permissions instagram_business_basic and
// instagram_business_manage_comments. Tokens last 60 days and are renewed in use.
// Facebook: a Page access token with pages_read_engagement,
// pages_read_user_content, pages_manage_engagement and pages_manage_posts.
// Personal profiles have no API for this.

import { promises as fs } from "node:fs";
import path from "node:path";
import { imageTypeForFilename, videoTypeForFilename } from "./uploads";

const INSTAGRAM = "https://graph.instagram.com/v23.0";
const FACEBOOK = "https://graph.facebook.com/v23.0";
const TIMEOUT_MS = 30_000;
/** Comments are read from posts this recent; older ones rarely get new ones. */
const POSTS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Renew an Instagram token older than this (it lasts 60 days; a renewal needs it a day old). */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

async function api<T>(label: string, url: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`${label}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  return json;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const isRecent = (iso: string, now: number) => now - new Date(iso).getTime() <= POSTS_MAX_AGE_MS;

/** A comment on one of your posts, the same shape for both platforms. */
export interface MetaComment {
  id: string;
  author: string;
  text: string;
  url: string;
  postedAt: string;
  postText: string;
}

// --- Instagram -----------------------------------------------------------------

/** The account an Instagram token belongs to. Throws with Meta's reason if it's refused. */
export function verifyInstagramToken(token: string): Promise<{ user_id: string; username: string }> {
  return api("Instagram", `${INSTAGRAM}/me?${q({ fields: "user_id,username", access_token: token })}`);
}

/** A renewed long-lived Instagram token, when this one is due for it; otherwise null. */
export async function refreshedInstagramToken(token: string, refreshedAt: string | undefined, now = Date.now()): Promise<string | null> {
  if (refreshedAt && now - new Date(refreshedAt).getTime() < REFRESH_AFTER_MS) return null;
  const { access_token } = await api<{ access_token: string }>(
    "Instagram",
    `https://graph.instagram.com/refresh_access_token?${q({ grant_type: "ig_refresh_token", access_token: token })}`,
  );
  return access_token;
}

export async function listInstagramComments(username: string, token: string, now = Date.now()): Promise<MetaComment[]> {
  const { data: media } = await api<{ data: { id: string; caption?: string; timestamp: string; permalink: string }[] }>(
    "Instagram",
    `${INSTAGRAM}/me/media?${q({ fields: "id,caption,timestamp,permalink", limit: "10", access_token: token })}`,
  );
  const out: MetaComment[] = [];
  for (const post of media.filter((m) => isRecent(m.timestamp, now))) {
    const { data: comments } = await api<{ data: { id: string; text?: string; username?: string; timestamp: string }[] }>(
      "Instagram",
      `${INSTAGRAM}/${post.id}/comments?${q({ fields: "id,text,username,timestamp", access_token: token })}`,
    );
    for (const c of comments) {
      if (!c.username || c.username.toLowerCase() === username.toLowerCase()) continue;
      // Comments have no link of their own; the post's shows them.
      out.push({ id: c.id, author: c.username, text: c.text ?? "", url: post.permalink, postedAt: c.timestamp, postText: post.caption ?? "" });
    }
  }
  return out;
}

export async function replyOnInstagram(token: string, commentId: string, text: string): Promise<void> {
  await api("Instagram", `${INSTAGRAM}/${commentId}/replies?${q({ message: text, access_token: token })}`, "POST");
}

// --- Facebook Pages ----------------------------------------------------------

/** The Page a token belongs to. A user token (no Page picked) is refused with a hint. */
export async function verifyFacebookPageToken(token: string): Promise<{ id: string; name: string }> {
  const me = await api<{ id: string; name: string; category?: string }>(
    "Facebook",
    `${FACEBOOK}/me?${q({ fields: "id,name,category", access_token: token })}`,
  );
  if (!me.category) {
    throw new Error("Facebook: that's a token for your personal profile. Pick your Page in the token generator to get a Page token.");
  }
  return { id: me.id, name: me.name };
}

export async function listFacebookComments(pageId: string, token: string, now = Date.now()): Promise<MetaComment[]> {
  const { data: posts } = await api<{ data: { id: string; message?: string; created_time: string }[] }>(
    "Facebook",
    `${FACEBOOK}/${pageId}/posts?${q({ fields: "id,message,created_time", limit: "10", access_token: token })}`,
  );
  const out: MetaComment[] = [];
  for (const post of posts.filter((p) => isRecent(p.created_time, now))) {
    const { data: comments } = await api<{
      data: { id: string; message?: string; from?: { id: string; name: string }; created_time: string; permalink_url?: string }[];
    }>(
      "Facebook",
      `${FACEBOOK}/${post.id}/comments?${q({
        fields: "id,message,from{id,name},created_time,permalink_url",
        filter: "toplevel",
        order: "reverse_chronological",
        access_token: token,
      })}`,
    );
    for (const c of comments) {
      if (c.from?.id === pageId) continue;
      out.push({
        id: c.id,
        // Without pages_read_user_content Meta leaves out who wrote it.
        author: c.from?.name ?? "someone",
        text: c.message ?? "",
        url: c.permalink_url ?? `https://www.facebook.com/${post.id}`,
        postedAt: c.created_time,
        postText: post.message ?? "",
      });
    }
  }
  return out;
}

export async function replyOnFacebook(token: string, commentId: string, text: string): Promise<{ url: string }> {
  const { id } = await api<{ id: string }>("Facebook", `${FACEBOOK}/${commentId}/comments?${q({ message: text, access_token: token })}`, "POST");
  const { permalink_url } = await api<{ permalink_url?: string }>(
    "Facebook",
    `${FACEBOOK}/${id}?${q({ fields: "permalink_url", access_token: token })}`,
  ).catch(() => ({ permalink_url: undefined }));
  return { url: permalink_url ?? "https://www.facebook.com/" };
}

/**
 * Posts to the Page through the Graph API, with the photo or video uploaded
 * straight from this computer, and returns the post's link.
 */
export async function postToFacebookPage(
  pageId: string,
  token: string,
  text: string,
  media: { imagePath?: string; videoPath?: string } = {},
): Promise<{ url: string }> {
  const file = media.imagePath ?? media.videoPath;
  if (!file) {
    const { id } = await api<{ id: string }>("Facebook", `${FACEBOOK}/${pageId}/feed?${q({ message: text, access_token: token })}`, "POST");
    return { url: `https://www.facebook.com/${id}` };
  }
  const name = path.basename(file);
  const form = new FormData();
  form.append("access_token", token);
  form.append(media.videoPath ? "description" : "caption", text);
  const type = (media.videoPath ? videoTypeForFilename(name) : imageTypeForFilename(name)) ?? "application/octet-stream";
  form.append("source", new Blob([new Uint8Array(await fs.readFile(file))], { type }), name);
  // Videos go to graph-video, Facebook's host for video uploads.
  const endpoint = media.videoPath
    ? `https://graph-video.facebook.com/v23.0/${pageId}/videos`
    : `${FACEBOOK}/${pageId}/photos`;
  const res = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(10 * 60_000) });
  const json = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(`Facebook: ${json.error?.message ?? `HTTP ${res.status}`}`);
  return { url: `https://www.facebook.com/${json.post_id ?? json.id}` };
}
