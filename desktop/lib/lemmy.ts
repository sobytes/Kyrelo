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
