import { randomUUID } from "node:crypto";
import { adaptPost } from "./ai";
import { fitText, PLATFORMS } from "./platforms";
import { createScheduledPost } from "./scheduler";
import { getFeedRules, getGrokSettings, listAccounts, modifyFeedRules } from "./storage";
import { CampaignTarget, FeedRule } from "./types";

// Auto-posting from RSS and Atom feeds: each new article in a feed becomes a
// post to the accounts the user picked, from a template ("{title} {link}") or
// written by the AI for each platform. Articles already in the feed when it's
// added are skipped, so adding a blog doesn't flood every account with its
// back catalogue.

export interface FeedItem {
  /** guid / id, or the link when the feed has neither. */
  id: string;
  title: string;
  link: string;
  summary: string;
  published?: string;
}

const TIMEOUT_MS = 30_000;
/** Ids remembered per feed: well past what a feed lists at once. */
const SEEN_MAX = 300;
/** New articles posted per feed per check; the rest wait for the next check. */
const ITEMS_PER_CHECK = 3;
/** Posts from one check go out this far apart, so several articles don't land at once. */
const SPACING_MS = 10 * 60_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Text inside an XML element: CDATA unwrapped, entities decoded, then tags
 * stripped (descriptions are often escaped HTML), whitespace collapsed.
 */
function text(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];
}

/** Reads RSS 2.0 and Atom feeds: their title and articles, newest first as the feed lists them. */
export function parseFeed(xml: string): { title: string; items: FeedItem[] } {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const head = xml.slice(0, xml.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i) >>> 0);
  const items = blocks.map((b): FeedItem => {
    const link = isAtom
      ? (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ?? b.match(/<link[^>]*href=["']([^"']+)["']/i))?.[1]
      : text(tag(b, "link"));
    const id = text(tag(b, isAtom ? "id" : "guid")) || link || text(tag(b, "title"));
    return {
      id,
      title: text(tag(b, "title")),
      link: (link ?? "").replace(/&amp;/g, "&").trim(),
      summary: text(tag(b, isAtom ? "summary" : "description") ?? tag(b, "content")).slice(0, 600),
      published: text(tag(b, isAtom ? "published" : "pubDate") ?? tag(b, "updated")) || undefined,
    };
  });
  return { title: text(tag(head, "title")), items: items.filter((i) => i.id) };
}

export async function fetchFeed(url: string): Promise<{ title: string; items: FeedItem[] }> {
  const res = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The feed answered HTTP ${res.status}.`);
  const feed = parseFeed(await res.text());
  if (feed.items.length === 0 && !feed.title) throw new Error("That address isn't an RSS or Atom feed.");
  return feed;
}

/** "{title}\n\n{link}" with the article's details filled in. */
export function fillTemplate(template: string, item: FeedItem): string {
  return template
    .replace(/\{title\}/g, item.title)
    .replace(/\{link\}/g, item.link)
    .replace(/\{summary\}/g, item.summary)
    .trim();
}

export const DEFAULT_TEMPLATE = "{title}\n\n{link}";

/** Adds a feed. Its current articles are marked as seen: only articles published after this are posted. */
export async function addFeedRule(input: { url: string; targets: CampaignTarget[]; template: string; useAi: boolean }): Promise<FeedRule> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Enter the feed's address, starting with https://.");
  const connected = await listAccounts();
  const targets = input.targets.filter((t) =>
    connected.some((a) => a.platform === t.platform && a.id === t.accountId && !PLATFORMS[a.platform].requiresVideo),
  );
  if (targets.length === 0) throw new Error("Pick at least one connected account.");
  const feed = await fetchFeed(url);
  const rule: FeedRule = {
    id: randomUUID(),
    url,
    title: feed.title || new URL(url).host,
    targets,
    template: input.template.trim() || DEFAULT_TEMPLATE,
    useAi: input.useAi,
    seen: feed.items.map((i) => i.id).slice(0, SEEN_MAX),
    createdAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
  };
  await modifyFeedRules((rules) => [...rules, rule]);
  return rule;
}

export async function removeFeedRule(id: string): Promise<void> {
  await modifyFeedRules((rules) => rules.filter((r) => r.id !== id));
}

/** The post for one account: the AI's version for its platform if asked (falling back to the template), fitted to its limit. */
async function postText(rule: FeedRule, item: FeedItem, target: CampaignTarget): Promise<string> {
  const spec = PLATFORMS[target.platform];
  const base = fillTemplate(rule.template, item);
  if (rule.useAi) {
    try {
      const brief = [item.title, item.summary, item.link].filter(Boolean).join("\n\n");
      const written = await adaptPost({ text: brief, platform: target.platform, provider: (await getGrokSettings()).aiProvider });
      // The AI keeps links, but make sure the article's is there.
      return written.includes(item.link) ? written : fitText(`${written}\n\n${item.link}`, spec.maxLength, spec.length);
    } catch (err) {
      console.warn(`[feeds] AI writing failed, using the template: ${err instanceof Error ? err.message : err}`);
    }
  }
  return fitText(base, spec.maxLength, spec.length);
}

// One check at a time, shared by the worker and "Check now".
const checkState = ((globalThis as { __kyreloFeeds?: { inFlight?: Promise<{ scheduled: number }> } }).__kyreloFeeds ??= {});

export function runFeedsCheck(): Promise<{ scheduled: number }> {
  checkState.inFlight ??= checkOnce().finally(() => {
    checkState.inFlight = undefined;
  });
  return checkState.inFlight;
}

async function checkOnce(): Promise<{ scheduled: number }> {
  let scheduled = 0;
  const connected = await listAccounts();
  for (const rule of await getFeedRules()) {
    let items: FeedItem[];
    try {
      items = (await fetchFeed(rule.url)).items;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await modifyFeedRules((rules) => rules.map((r) => (r.id === rule.id ? { ...r, error, lastCheckedAt: new Date().toISOString() } : r)));
      continue;
    }
    const seen = new Set(rule.seen);
    // Oldest first, so a burst of articles goes out in the order they were published.
    const fresh = items.filter((i) => !seen.has(i.id)).slice(0, ITEMS_PER_CHECK).reverse();
    const targets = rule.targets.filter((t) => connected.some((a) => a.platform === t.platform && a.id === t.accountId));
    for (const [n, item] of fresh.entries()) {
      for (const target of targets) {
        await createScheduledPost({
          platform: target.platform,
          accountId: target.accountId,
          text: await postText(rule, item, target),
          scheduledFor: new Date(Date.now() + 60_000 + n * SPACING_MS).toISOString(),
        });
        scheduled++;
      }
    }
    await modifyFeedRules((rules) =>
      rules.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              seen: [...fresh.map((i) => i.id), ...r.seen].slice(0, SEEN_MAX),
              lastCheckedAt: new Date().toISOString(),
              error: undefined,
            }
          : r,
      ),
    );
  }
  return { scheduled };
}
