// Blogs and videos need a title as well as a body. A Kyrelo post is one text,
// so its first line is the title and the rest is the body.

/** The first non-empty line as the title (cut to `maxTitle` characters), and the text after it as the body. */
export function splitTitle(text: string, maxTitle: number): { title: string; body: string } {
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return { title: "", body: "" };
  const chars = Array.from(lines[first].trim());
  const title = chars.length > maxTitle ? `${chars.slice(0, maxTitle - 1).join("").trimEnd()}…` : chars.join("");
  return { title, body: lines.slice(first + 1).join("\n").trim() };
}
