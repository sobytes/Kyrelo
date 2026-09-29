// Keyword monitoring: the Monitor also searches X for posts that mention the
// user's keywords, alongside the handles it watches. Pure, so the settings
// route, the scraper and the tests share one set of rules.

/** Every keyword is a search on each check, and matches fill the feed fast. */
export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 60;
/** Keywords per X search; each search is one page load. */
export const KEYWORDS_PER_SEARCH = 5;

/** Keywords from a request or old settings: trimmed, de-duplicated (any case), capped. */
export function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const k = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!k || k.length > MAX_KEYWORD_LENGTH || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * A keyword as an X search term. A plain phrase is quoted so its words must
 * appear together ("invoice app", not "invoice" anywhere and "app" anywhere).
 * Anything already using X's search syntax (quotes, #tags, $cashtags,
 * @mentions, operators like -word or lang:en, OR) is left as the user wrote it.
 */
export function searchTerm(keyword: string): string {
  const usesSyntax = /["#$@:]|(^|\s)-\S|\sOR\s/.test(keyword);
  if (usesSyntax || !/\s/.test(keyword)) return keyword;
  return `"${keyword}"`;
}

/** The X search for a group of keywords: newest original posts, not the user's own. */
export function keywordQuery(keywords: string[], opts: { includeReplies: boolean; exclude: string[] }): string {
  const terms = keywords.map(searchTerm);
  const parts = [terms.length > 1 ? `(${terms.join(" OR ")})` : terms[0], "-filter:retweets"];
  if (!opts.includeReplies) parts.push("-filter:replies");
  for (const handle of opts.exclude) parts.push(`-from:${handle}`);
  return parts.join(" ");
}

/**
 * Which of the searched keywords the post's text mentions, or undefined.
 * X also matches on the author's name and handle (a search for "kyrelo"
 * returns every post by @SomeoneKyrelo), and those aren't mentions, so a
 * post whose text matches none of them is left out.
 */
export function matchedKeyword(text: string, keywords: string[]): string | undefined {
  const lower = text.toLowerCase();
  // A keyword's alternatives ("buffer OR hypefury"), each a list of words
  // that must all appear. Operators (-word, lang:en) and quotes aren't words.
  const alternatives = (k: string) =>
    k.split(/\s+OR\s+/).map((alt) =>
      alt
        .toLowerCase()
        .replace(/[()"]/g, "")
        .split(/\s+/)
        .filter((w) => w && !w.startsWith("-") && !w.includes(":")),
    );
  return keywords.find((k) =>
    alternatives(k).some((words) => words.length > 0 && words.every((w) => lower.includes(w))),
  );
}
