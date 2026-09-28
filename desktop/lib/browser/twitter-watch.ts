import { promises as fs } from "node:fs";
import path from "node:path";
import { Page } from "playwright";
import { dataDir } from "../storage";
import { assertLoggedIn, browserHasWaiters, jitter, openBrowser } from "./session";

async function dumpDebug(page: Page, label: string) {
  const dir = path.join(dataDir, "debug");
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const png = path.join(dir, `twitter-watch-${label}-${stamp}.png`);
  await page.screenshot({ path: png }).catch(() => {});
  console.log(`[twitter-watch] saved debug → ${png}`);
  // Every failed handle on every tick writes one, so cap the folder.
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter(
    (f) => f.startsWith("twitter-watch-") && f.endsWith(".png"),
  );
  const aged = await Promise.all(
    names.map(async (f) => ({ f, t: (await fs.stat(path.join(dir, f)).catch(() => null))?.mtimeMs ?? 0 })),
  );
  aged.sort((a, b) => b.t - a.t);
  for (const { f } of aged.slice(30)) {
    await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
  }
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

async function scrapeOnPage(
  page: Page,
  handle: string,
  includeReplies: boolean,
  limit: number,
): Promise<ScrapedTweet[]> {
  const url = includeReplies
    ? `https://x.com/${handle}/with_replies`
    : `https://x.com/${handle}`;
  return scrapeUrl(page, url, [handle], limit, `no-articles-${handle}`);
}

/**
 * X's "Latest" search for several handles at once: one page load instead of
 * one per handle. `from:` matches only tweets the handle wrote (not reposts),
 * the same set the profile scrape keeps.
 */
function searchUrl(handles: string[], includeReplies: boolean): string {
  const query = `(${handles.map((h) => `from:${h}`).join(" OR ")})${includeReplies ? "" : " -filter:replies"}`;
  return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
}

async function scrapeUrl(
  page: Page,
  url: string,
  handles: string[],
  limit: number,
  debugLabel: string,
): Promise<ScrapedTweet[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await jitter(2000, 4000);
  assertLoggedIn(page);

  try {
    await page.locator('article[data-testid="tweet"]').first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  } catch {
    await dumpDebug(page, debugLabel);
    return [];
  }

  // Two small scrolls to load a few more tweets (X lazy-renders).
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 600);
    await jitter(700, 1400);
  }

  const handleByLower = Object.fromEntries(handles.map((h) => [h.toLowerCase(), h]));

  const tweets = await page.evaluate(
    ({ watched, limit }) => {
        const out: {
          id: string;
          author: string;
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
          let author: string | null = null;
          let postedAt: string | undefined;
          for (const a of Array.from(anchors)) {
            const m = a.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/);
            if (!m) continue;
            // Only count tweets from a watched handle (skip quoted/retweeted others).
            if (!watched.includes(m[1].toLowerCase())) continue;
            statusUrl = `https://x.com${a.getAttribute("href")}`;
            id = m[2];
            author = m[1].toLowerCase();
            const timeEl = a.querySelector("time");
            const dt = timeEl?.getAttribute("datetime");
            if (dt) postedAt = dt;
            break;
          }
          if (!id || !statusUrl || !author) continue;
          if (seen.has(id)) continue;
          seen.add(id);

          const textEl = art.querySelector('[data-testid="tweetText"]');
          const text = (textEl?.textContent ?? "").trim();
          if (!text) continue;

          // "Replying to @x" marker is rendered as a div before the tweet text.
          const replyingTo = Array.from(art.querySelectorAll("div")).some((d) =>
            /^Replying to /i.test(d.textContent ?? ""),
          );

          out.push({ id, author, url: statusUrl, text, isReply: replyingTo, postedAt });
        }
        return out;
      },
      { watched: Object.keys(handleByLower), limit },
    );

  return tweets.map(({ author, ...t }) => ({ ...t, handle: handleByLower[author] }));
}

// Handles per search. Keeps each query well under X's search length limit.
const HANDLES_PER_SEARCH = 15;

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
    purpose: "scrape",
    headless: true,
    accountId: opts.accountId,
  });
  const { page } = browser;
  const out: ScrapedTweet[] = [];
  try {
    // No home-feed warmup: going straight to the search keeps a check short,
    // so the browser is free for scheduled posts most of the time.
    for (let i = 0; i < handles.length; i += HANDLES_PER_SEARCH) {
      // A scheduled post (or other job) is waiting for this browser. Stop
      // here and let it run; the remaining handles are picked up next tick.
      if (browserHasWaiters("twitter", opts.accountId)) {
        console.log("[twitter-watch] another job is waiting for the browser — yielding early");
        break;
      }
      if (page.isClosed()) {
        console.warn("[twitter-watch] page closed — aborting remaining scrapes");
        break;
      }
      const chunk = handles.slice(i, i + HANDLES_PER_SEARCH);
      try {
        // Newest first across all handles in the chunk, so allow a few per handle.
        const found = await scrapeUrl(
          page,
          searchUrl(chunk, opts.includeReplies),
          chunk,
          limit * Math.min(chunk.length, 3),
          "no-articles-search",
        );
        if (found.length > 0) {
          out.push(...found);
        } else {
          // Search showed nothing (X can restrict search). Fall back to the
          // profile pages so the Monitor still works, just slower.
          console.warn("[twitter-watch] search returned no tweets — checking profiles one by one");
          out.push(...(await scrapeProfiles(page, chunk, opts, limit)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/closed|disconnect|crashed/i.test(msg)) {
          console.warn("[twitter-watch] browser closed mid-scrape — aborting");
          break;
        }
        console.warn(`[twitter-watch] search failed for ${chunk.length} handle(s): ${msg}`);
      }
    }
    return out;
  } finally {
    await browser.close();
  }
}


/** The slow path: one profile page per handle. */
async function scrapeProfiles(
  page: Page,
  handles: string[],
  opts: MultiScrapeOptions,
  limit: number,
): Promise<ScrapedTweet[]> {
  const out: ScrapedTweet[] = [];
  for (const handle of handles) {
    if (browserHasWaiters("twitter", opts.accountId) || page.isClosed()) break;
    try {
      out.push(...(await scrapeOnPage(page, handle, opts.includeReplies, limit)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/closed|disconnect|crashed/i.test(msg)) break;
      console.warn(`[twitter-watch] scrape failed for @${handle}: ${msg}`);
    }
    await jitter(800, 1800);
  }
  return out;
}
