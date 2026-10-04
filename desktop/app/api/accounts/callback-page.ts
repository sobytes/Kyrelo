import tokens from "../../../../contracts/design-tokens.json";

// The page a browser tab shows after a platform redirects back to Kyrelo
// (Mastodon, or the user's own developer app), in the design system's colours.

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** A small page in the design system's colours, for the browser tab. */
export function callbackPage(title: string, body: string): string {
  const c = tokens.color;
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)} · Kyrelo</title>
<body style="margin:0;background:${c.canvas};color:${c.fg};font:15px/1.5 Inter,system-ui,sans-serif">
<main style="max-width:480px;margin:18vh auto;padding:0 24px">
<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">${esc(title)}</h1>
<p style="color:${c.muted};margin:0">${esc(body)}</p>
</main></body>`;
}
