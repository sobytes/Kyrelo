import { promises as fs } from "node:fs";
import path from "node:path";
import { Page } from "playwright";
import { jitter, openBrowser, warmup } from "./session";

async function dumpDebug(page: Page, label: string) {
  const dir = path.join(
    process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data"),
    "debug",
  );
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const png = path.join(dir, `twitter-watch-${label}-${stamp}.png`);
  await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  console.log(`[twitter-watch] saved debug → ${png}`);
}

export interface ScrapedTweet {
  id: string;
  handle: string;
  url: string;
  text: string;
  isReply: boolean;
  postedAt?: string;
}

export interface ScrapeOptions {
  handle: string;
  includeReplies: boolean;
  /** Max tweets to return. The page may render more; we slice. */
  limit?: number;
}

function assertLoggedIn(page: Page) {
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow/login")) {
    throw new Error("X session expired. Reconnect under Connected accounts.");
  }
}

async function scrapeOnPage(
  page: Page,
  handle: string,
  includeReplies: boolean,
  limit: number,
): Promise<ScrapedTweet[]> {
  const url = includeReplies
    ? `https://x.com/${handle}/with_replies`
    : `https://x.com/${handle}`;

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await jitter(2000, 4000);
  assertLoggedIn(page);

  try {
    await page.locator('article[data-testid="tweet"]').first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  } catch {
    await dumpDebug(page, `no-articles-${handle}`);
    return [];
  }

  // Two small scrolls to load a few more tweets (X lazy-renders).
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 600);
    await jitter(700, 1400);
  }

  const handleLower = handle.toLowerCase();

  const tweets = await page.evaluate(
    ({ handleLower, limit }) => {
        const out: {
          id: string;
          url: string;
          text: string;
          isReply: boolean;
          postedAt?: string;
        }[] = [];
        const seen = new Set<string>();
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        for (const art of Array.from(articles)) {
          if (out.length >= limit) break;

          // Skip pinned tweets — they show "Pinned" via SVG label + text node.
          const social = art.querySelector('[data-testid="socialContext"]');
          if (social && /pinned/i.test(social.textContent ?? "")) continue;

          // Status link (the timestamp anchor) — the same anchor wraps the <time> element.
          const anchors = art.querySelectorAll(
            `a[role="link"][href*="/status/"]`,
          ) as NodeListOf<HTMLAnchorElement>;
          let statusUrl: string | null = null;
          let id: string | null = null;
          let postedAt: string | undefined;
          for (const a of Array.from(anchors)) {
            const m = a.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/);
            if (!m) continue;
            // Only count tweets from the watched handle (skip quoted/retweeted others).
            if (m[1].toLowerCase() !== handleLower) continue;
            statusUrl = `https://x.com${a.getAttribute("href")}`;
            id = m[2];
            const timeEl = a.querySelector("time");
            const dt = timeEl?.getAttribute("datetime");
            if (dt) postedAt = dt;
            break;
          }
          if (!id || !statusUrl) continue;
          if (seen.has(id)) continue;
          seen.add(id);

          const textEl = art.querySelector('[data-testid="tweetText"]');
          const text = (textEl?.textContent ?? "").trim();
          if (!text) continue;

          // "Replying to @x" marker is rendered as a div before the tweet text.
          const replyingTo = Array.from(art.querySelectorAll("div")).some((d) =>
            /^Replying to /i.test(d.textContent ?? ""),
          );

          out.push({ id, url: statusUrl, text, isReply: replyingTo, postedAt });
        }
        return out;
      },
      { handleLower, limit },
    );

  return tweets.map((t) => ({ ...t, handle }));
}

export interface MultiScrapeOptions {
  accountId: string;
  handles: string[];
  includeReplies: boolean;
  limit?: number;
}

export async function scrapeManyTimelines(
  opts: MultiScrapeOptions,
): Promise<ScrapedTweet[]> {
  if (opts.handles.length === 0) return [];
  const limit = opts.limit ?? 12;
  const handles = opts.handles.map((h) => h.replace(/^@/, "")).filter(Boolean);

  // Scrapes run headless so the polling browser doesn't pop up every tick.
  const browser = await openBrowser("twitter", {
    headless: true,
    accountId: opts.accountId,
  });
  const { page } = browser;
  const out: ScrapedTweet[] = [];
  try {
    try {
      await warmup(page, "https://x.com/home");
    } catch (err) {
      console.warn("[twitter-watch] warmup skipped:", err);
    }
    assertLoggedIn(page);

    for (const handle of handles) {
      if (page.isClosed()) {
        console.warn("[twitter-watch] page closed — aborting remaining scrapes");
        break;
      }
      try {
        const tweets = await scrapeOnPage(page, handle, opts.includeReplies, limit);
        out.push(...tweets);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/closed|disconnect|crashed/i.test(msg)) {
          console.warn("[twitter-watch] browser closed mid-scrape — aborting");
          break;
        }
        console.warn(`[twitter-watch] scrape failed for @${handle}: ${msg}`);
      }
      await jitter(800, 1800);
    }
    return out;
  } finally {
    await browser.close();
  }
}

