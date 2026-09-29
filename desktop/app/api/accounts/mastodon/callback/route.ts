import { NextRequest } from "next/server";
import { finishMastodonConnect } from "@/lib/accounts";
import tokens from "../../../../../../contracts/design-tokens.json";

export const dynamic = "force-dynamic";

// Where the user's Mastodon server sends the browser after they approve
// Kyrelo. It arrives as a top-level navigation from their server, which
// middleware.ts lets through for this path only; the one-time `state`
// (from startMastodonConnect) is what proves the request is ours.
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const denied = req.nextUrl.searchParams.get("error");
  const result = denied || !code ? { error: "Kyrelo wasn't approved. You can try again from Kyrelo." } : await finishMastodonConnect(state, code);
  const ok = "ok" in result;
  return new Response(page(ok ? "Mastodon connected" : "Couldn't connect Mastodon", ok ? `@${result.handle} is connected. You can close this tab and go back to Kyrelo.` : result.error), {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** A small page in the design system's colours, for the browser tab. */
function page(title: string, body: string): string {
  const c = tokens.color;
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)} · Kyrelo</title>
<body style="margin:0;background:${c.canvas};color:${c.fg};font:15px/1.5 Inter,system-ui,sans-serif">
<main style="max-width:480px;margin:18vh auto;padding:0 24px">
<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">${esc(title)}</h1>
<p style="color:${c.muted};margin:0">${esc(body)}</p>
</main></body>`;
}
