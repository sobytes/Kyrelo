import { splitTitle } from "./title";

// DEV (dev.to) through its API with the user's API key (Settings → Extensions
// → DEV Community API Keys). The post's first line is the article's title and
// the rest its Markdown body.

const API = "https://dev.to/api";
const TIMEOUT_MS = 30_000;

async function api<T>(apiKey: string, endpoint: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    ...init,
    headers: { "api-key": apiKey, Accept: "application/vnd.forem.api-v1+json", "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`DEV: ${json.error ?? `HTTP ${res.status}`}`);
  return json;
}

export function verifyDevTo(apiKey: string): Promise<{ id: number; username: string }> {
  return api(apiKey, "users/me");
}

export async function postToDevTo(apiKey: string, text: string): Promise<{ url: string }> {
  const { title, body } = splitTitle(text, 128);
  const article = await api<{ url: string }>(apiKey, "articles", {
    method: "POST",
    body: JSON.stringify({ article: { title, body_markdown: body || title, published: true } }),
  });
  return { url: article.url };
}
