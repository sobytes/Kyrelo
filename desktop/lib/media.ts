import dns from "node:dns/promises";
import net from "node:net";
import { openAiPost } from "./ai";
import { IMAGE_EXT_BY_TYPE, MAX_IMAGE_BYTES, saveImage } from "./uploads";

// Produces image files in .data/uploads/ for Auto Campaign posts. Every
// function returns a bare filename (what ScheduledPost.imagePath expects), so
// the existing scheduler attaches them with no changes.


// URLs here come from AI output that read arbitrary web pages, so refuse
// anything that resolves to this machine or the local network (e.g. this
// app's own API on 127.0.0.1). Checked on the resolved IPs, not the name, so
// DNS tricks like localtest.me → 127.0.0.1 don't get through, and re-checked
// on every redirect hop and browser request.
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`not an http(s) URL: ${raw}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new Error(`refusing local address: ${u.hostname}`);
  return u;
}

/** fetch() that validates the target and every redirect hop. */
async function safeFetch(raw: string): Promise<Response> {
  let url = raw;
  for (let hop = 0; hop < 5; hop++) {
    const target = await assertPublicUrl(url);
    const res = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const next = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !next) return res;
    url = new URL(next, target).toString();
  }
  throw new Error("too many redirects");
}

/** Downloads the page's og:image / twitter:image. */
export async function fetchOgImage(pageUrl: string): Promise<string> {
  const pageRes = await safeFetch(pageUrl);
  const page = new URL(pageRes.url || pageUrl);
  const html = await pageRes.text();
  const match =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!match) throw new Error("the site has no og:image");
  const imageUrl = new URL(match[1].replace(/&amp;/g, "&"), page).toString();

  const res = await safeFetch(imageUrl);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = IMAGE_EXT_BY_TYPE[type];
  if (!res.ok || !ext) throw new Error(`og:image isn't a usable image (${res.status} ${type})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES) throw new Error("og:image is too large");
  return saveImage(data, ext);
}

/**
 * Screenshots the top of a page in a headless browser. Only pages on the
 * product's own site (or its subdomains) — the AI picks the URL, and this
 * image may be posted publicly.
 */
export async function screenshotPage(pageUrl: string, productUrl: string): Promise<string> {
  const url = await assertPublicUrl(pageUrl);
  const site = new URL(productUrl).hostname.replace(/^www\./, "");
  const host = url.hostname.replace(/^www\./, "");
  if (host !== site && !host.endsWith(`.${site}`)) throw new Error(`${url.hostname} isn't on ${site}`);

  const { openBrowser } = await import("./browser/session");
  const handle = await openBrowser("web", {
    accountId: "screenshots",
    headless: true,
    purpose: "screenshot",
  });
  try {
    // Block any request (redirects, iframes, scripts) that targets a local address.
    await handle.page.route("**/*", async (route) => {
      try {
        await assertPublicUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });
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
  // Image generation is slow; allow longer than the default.
  const json = await openAiPost<{ data?: { b64_json?: string }[] }>(
    "images/generations",
    {
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      prompt: `${prompt}\n\nNo text, words or logos in the image.`,
      size: "1536x1024",
      n: 1,
    },
    3 * 60_000,
  );
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return saveImage(Buffer.from(b64, "base64"), ".png");
}
