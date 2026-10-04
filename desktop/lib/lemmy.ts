import { promises as fs } from "node:fs";
import path from "node:path";
import { splitTitle } from "./title";
import { imageTypeForFilename } from "./uploads";

// Lemmy through its HTTP API (v3, Lemmy 0.19), signed in with the user's
// username and password on their instance, posting to one community per
// connected account. Lemmy posts have a title: the first line; the rest is the
// body. An image is uploaded to the instance and becomes the post's link.
// Accounts with two-factor sign-in aren't supported.

const TIMEOUT_MS = 30_000;

export interface LemmyLogin {
  /** https://lemmy.world */
  instance: string;
  username: string;
  password: string;
}

/** "me@lemmy.world" → { username: "me", instance: "https://lemmy.world" }. */
export function parseLemmyHandle(input: string): { username: string; instance: string } | null {
  const m = input.trim().replace(/^@/, "").match(/^([\w.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
  return m ? { username: m[1], instance: `https://${m[2].toLowerCase()}` } : null;
}

async function api<T>(instance: string, endpoint: string, init: RequestInit & { jwt?: string } = {}): Promise<T> {
  const { jwt, headers, ...rest } = init;
  const res = await fetch(`${instance}/api/v3/${endpoint}`, {
    ...rest,
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`Lemmy: ${json.error?.replace(/_/g, " ") ?? `HTTP ${res.status}`}`);
  return json;
}

export async function lemmyLogin(login: LemmyLogin): Promise<string> {
  const { jwt } = await api<{ jwt?: string }>(login.instance, "user/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username_or_email: login.username, password: login.password }),
  });
  if (!jwt) throw new Error("Lemmy: sign-in didn't finish. If the account uses two-factor sign-in, Kyrelo can't use it yet.");
  return jwt;
}

/** The community's id on this instance ("technology" or "technology@lemmy.ml"). */
export async function findCommunity(instance: string, jwt: string, name: string): Promise<{ id: number; name: string }> {
  const clean = name.trim().replace(/^!/, "");
  const { community_view } = await api<{ community_view: { community: { id: number; name: string } } }>(
    instance,
    `community?${new URLSearchParams({ name: clean })}`,
    { jwt },
  );
  return community_view.community;
}

async function uploadImage(instance: string, jwt: string, imagePath: string): Promise<string> {
  const form = new FormData();
  const name = path.basename(imagePath);
  form.append("images[]", new Blob([new Uint8Array(await fs.readFile(imagePath))], { type: imageTypeForFilename(name) ?? "image/png" }), name);
  const res = await fetch(`${instance}/pictrs/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { files?: { file: string }[]; msg?: string };
  const file = json.files?.[0]?.file;
  if (!res.ok || !file) throw new Error(`Lemmy: the image upload failed (${json.msg ?? `HTTP ${res.status}`}).`);
  return `${instance}/pictrs/image/${file}`;
}

export async function postToLemmy(login: LemmyLogin, communityId: number, text: string, imagePath?: string): Promise<{ url: string }> {
  const jwt = await lemmyLogin(login);
  const url = imagePath ? await uploadImage(login.instance, jwt, imagePath) : undefined;
  const { title, body } = splitTitle(text, 200);
  const { post_view } = await api<{ post_view: { post: { id: number } } }>(login.instance, "post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: title, community_id: communityId, ...(body ? { body } : {}), ...(url ? { url } : {}) }),
    jwt,
  });
  return { url: `${login.instance}/post/${post_view.post.id}` };
}

/** A reply to one of your posts or comments, on a post in the given community. */
export interface LemmyComment {
  id: number;
  postId: number;
  author: string;
  text: string;
  url: string;
  postedAt: string;
  /** Your post it's under. */
  postText: string;
}

interface ReplyView {
  comment: { id: number; content: string; published: string; ap_id: string; deleted?: boolean; removed?: boolean };
  creator: { name: string; actor_id: string };
  post: { id: number; name: string; body?: string; community_id: number };
}

/** host of an actor URL: https://lemmy.ml/u/fan → fan@lemmy.ml */
function actorHandle(name: string, actorId: string): string {
  try {
    return `${name}@${new URL(actorId).host}`;
  } catch {
    return name;
  }
}

/** The newest replies to you on posts in this community (each connected account is one community). */
export async function listLemmyComments(login: LemmyLogin, communityId: number): Promise<LemmyComment[]> {
  const jwt = await lemmyLogin(login);
  const { replies } = await api<{ replies: ReplyView[] }>(login.instance, "user/replies?sort=New&limit=50&unread_only=false", { jwt });
  return replies
    .filter((r) => r.post.community_id === communityId && !r.comment.deleted && !r.comment.removed)
    .map((r) => ({
      id: r.comment.id,
      postId: r.post.id,
      author: actorHandle(r.creator.name, r.creator.actor_id),
      text: r.comment.content,
      url: r.comment.ap_id,
      postedAt: r.comment.published.endsWith("Z") ? r.comment.published : `${r.comment.published}Z`,
      postText: [r.post.name, r.post.body ?? ""].join("\n\n").trim(),
    }));
}

export async function replyOnLemmy(login: LemmyLogin, comment: { id: number; postId: number }, text: string): Promise<{ url: string }> {
  const jwt = await lemmyLogin(login);
  const { comment_view } = await api<{ comment_view: { comment: { ap_id: string } } }>(login.instance, "comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, post_id: comment.postId, parent_id: comment.id }),
    jwt,
  });
  return { url: comment_view.comment.ap_id };
}
