import { NextRequest } from "next/server";
import { finishMastodonConnect } from "@/lib/accounts";
import { callbackPage as page } from "../../callback-page";

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
