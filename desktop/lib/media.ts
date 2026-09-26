import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveOpenAiKey } from "./ai";

// Produces image files in .data/uploads/ for Auto Campaign posts. Every
// function returns a bare filename (what ScheduledPost.imagePath expects), so
// the existing scheduler attaches them with no changes.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export function uploadsDir(): string {
  const root = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data");
  return path.join(root, "uploads");
}

async function saveImage(data: Buffer, ext: string): Promise<string> {
  const filename = `${randomUUID()}${ext}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), filename), data);
  return filename;
}

// URLs here come from AI output that read arbitrary web pages, so refuse
// anything pointing back at this machine or the local network (e.g. this
// app's own API on localhost:3000).
const PRIVATE_HOST =
  /^(localhost|.*\.local|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\])$/i;

function assertHttpUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`not an http(s) URL: ${raw}`);
  if (PRIVATE_HOST.test(u.hostname)) throw new Error(`refusing local address: ${u.hostname}`);
  return u;
}

/** Downloads the page's og:image / twitter:image. */
export async function fetchOgImage(pageUrl: string): Promise<string> {
  const page = assertHttpUrl(pageUrl);
  const html = await fetch(page, { signal: AbortSignal.timeout(15_000) }).then((r) => r.text());
  const match =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!match) throw new Error("the site has no og:image");
  const imageUrl = assertHttpUrl(new URL(match[1].replace(/&amp;/g, "&"), page).toString());

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = EXT_BY_TYPE[type];
  if (!res.ok || !ext) throw new Error(`og:image isn't a usable image (${res.status} ${type})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES) throw new Error("og:image is too large");
  return saveImage(data, ext);
}

/** Screenshots the top of a page in a headless browser. */
export async function screenshotPage(pageUrl: string): Promise<string> {
  const url = assertHttpUrl(pageUrl);
  const { openBrowser } = await import("./browser/session");
  const handle = await openBrowser("web", { accountId: "screenshots", headless: true });
  try {
    await handle.page.setViewportSize({ width: 1280, height: 720 });
    await handle.page.goto(url.toString(), { waitUntil: "load", timeout: 30_000 });
    // Let fonts, lazy images and entrance animations settle.
    await handle.page.waitForTimeout(2_500);
    const data = await handle.page.screenshot({ type: "jpeg", quality: 85 });
    return saveImage(data, ".jpg");
  } finally {
    await handle.close();
  }
}

/** Generates an illustration with OpenAI's image model. Needs an OpenAI key. */
export async function generateAiImage(prompt: string): Promise<string> {
  const apiKey = await resolveOpenAiKey();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      prompt: `${prompt}\n\nNo text, words or logos in the image.`,
      size: "1536x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI image ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return saveImage(Buffer.from(b64, "base64"), ".png");
}
