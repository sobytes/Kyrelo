import { promises as fs } from "node:fs";
import path from "node:path";
import { splitTitle } from "./title";
import { imageTypeForFilename } from "./uploads";

// A self-hosted WordPress site through its REST API, signed in with an
// application password (Users → Profile → Application Passwords, WordPress
// 5.6+). The post's first line is the title and the rest its content; an
// attached image becomes the featured image.

const TIMEOUT_MS = 60_000;

export interface WordPressLogin {
  site: string;
  username: string;
  appPassword: string;
}

/** "example.com/blog/" → "https://example.com/blog". */
export function normalizeSite(input: string): string | null {
  const s = input.trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

async function api<T>(login: WordPressLogin, endpoint: string, init: RequestInit = {}): Promise<T> {
  const auth = Buffer.from(`${login.username}:${login.appPassword.replace(/\s+/g, "")}`).toString("base64");
  const res = await fetch(`${login.site}/wp-json/wp/v2/${endpoint}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`WordPress: ${json.message?.replace(/<[^>]+>/g, "") ?? `HTTP ${res.status}`}`);
  return json;
}

/** Checks the login can write posts; returns the user's name on the site. */
export async function verifyWordPress(login: WordPressLogin): Promise<{ name: string }> {
  const me = await api<{ name: string; capabilities?: Record<string, boolean> }>(login, "users/me?context=edit");
  if (me.capabilities && !me.capabilities.publish_posts) throw new Error("WordPress: this user can't publish posts.");
  return { name: me.name };
}

export async function postToWordPress(login: WordPressLogin, text: string, imagePath?: string): Promise<{ url: string }> {
  let featured: number | undefined;
  if (imagePath) {
    const name = path.basename(imagePath);
    const media = await api<{ id: number }>(login, "media", {
      method: "POST",
      headers: { "Content-Type": imageTypeForFilename(name) ?? "image/png", "Content-Disposition": `attachment; filename="${name}"` },
      body: new Uint8Array(await fs.readFile(imagePath)),
    });
    featured = media.id;
  }
  const { title, body } = splitTitle(text, 200);
  // Plain text in, paragraphs out: WordPress adds the <p> tags itself.
  const post = await api<{ link: string }>(login, "posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content: body, status: "publish", ...(featured ? { featured_media: featured } : {}) }),
  });
  return { url: post.link };
}
