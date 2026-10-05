// Keeps auto campaigns from repeating themselves. AI writers fall back on the
// same hooks and phrasings, so a new campaign can come out nearly word for
// word like an earlier one. This measures how close two posts are, so drafts
// that echo the history (or each other) can be rewritten.

/** Lowercase words, without links, mentions, punctuation or emoji. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Overlapping three-word runs: what two posts saying the same thing share. */
function shingles(w: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
}

/**
 * 0–1: how much of the shorter post's wording the other repeats (shared
 * three-word runs over the shorter post's), and 1 when they open with the
 * same five words, the most visible kind of repeat.
 */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length >= 5 && wb.length >= 5 && wa.slice(0, 5).join(" ") === wb.slice(0, 5).join(" ")) return 1;
  const sa = shingles(wa);
  const sb = shingles(wb);
  if (sa.size === 0 || sb.size === 0) return wa.join(" ") === wb.join(" ") && wa.length > 0 ? 1 : 0;
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared++;
  return shared / Math.min(sa.size, sb.size);
}

/** Above this, a draft reads as a rerun of an earlier post. */
export const REPEAT_THRESHOLD = 0.4;

/** The earlier post `text` repeats, if any: from `history`, or `siblings` (the same batch, written before it). */
export function findRepeat(text: string, history: string[], siblings: string[] = []): string | null {
  for (const other of [...siblings, ...history]) {
    if (similarity(text, other) >= REPEAT_THRESHOLD) return other;
  }
  return null;
}
