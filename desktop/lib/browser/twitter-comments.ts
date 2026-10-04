import { Page } from "playwright";
import { assertLoggedIn, browserHasWaiters, jitter, openBrowser } from "./session";
import { scrapeUrl } from "./twitter-watch";

// Comments on the user's own tweets, read from X's Mentions tab: replies to
// you land there as "Replying to @you". The tweet they reply to isn't shown
// in that list, so each comment not seen before is opened once to read it.

export interface XComment {
  id: string;
  author: string;
  text: string;
  url: string;
  postedAt?: string;
  /** Your tweet it replies to, when it could be read. */
  postText: string;
}

const MENTIONS_URL = "https://x.com/notifications/mentions";
/** Comments opened per check to read the tweet they reply to; the rest wait for the next check. */
const MAX_NEW_PER_CHECK = 5;

export async function listXComments(accountId: string, handle: string, known: Set<string>): Promise<XComment[]> {
  // Headless, like the Monitor, so checks don't pop a window up.
  const browser = await openBrowser("twitter", { purpose: "comments", headless: true, accountId });
  const { page } = browser;
  try {
    const found = await scrapeUrl(page, MENTIONS_URL, null, 30, "no-articles-mentions");
    const me = handle.toLowerCase();
    const comments: XComment[] = [];
    for (const t of found) {
      if (!t.isReply || t.handle.toLowerCase() === me || known.has(t.id)) continue;
      if (comments.length >= MAX_NEW_PER_CHECK || browserHasWaiters("twitter", accountId)) break;
      const postText = await readRepliedTo(page, t.url, t.id, me);
      // null: it replies to someone else's tweet in a thread you're named in.
      if (postText === null) continue;
      comments.push({ id: t.id, author: t.handle, text: t.text, url: t.url, postedAt: t.postedAt, postText });
      await jitter(800, 1600);
    }
    return comments;
  } finally {
    await browser.close();
  }
}

/** The text of your tweet that this comment answers, or null if it answers someone else's. */
async function readRepliedTo(page: Page, url: string, id: string, me: string): Promise<string | null> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await jitter(1500, 2500);
  assertLoggedIn(page);
  await page.locator('article[data-testid="tweet"]').first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  return page.evaluate(
    ({ id, me }) => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      const authorOf = (art: Element) =>
        Array.from(art.querySelectorAll('a[href*="/status/"]'))
          .map((a) => a.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/))
          .find(Boolean);
      // The thread is shown oldest first: the comment, and the tweet it answers just above it.
      const index = articles.findIndex((a) => authorOf(a)?.[2] === id);
      if (index <= 0) return null;
      const parent = articles[index - 1];
      if (authorOf(parent)?.[1].toLowerCase() !== me) return null;
      return (parent.querySelector('[data-testid="tweetText"]')?.textContent ?? "").trim();
    },
    { id, me },
  );
}
