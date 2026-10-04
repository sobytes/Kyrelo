import { NextRequest } from "next/server";
import { finishAppConnect } from "@/lib/accounts";
import { PLATFORMS } from "@/lib/platforms";
import { callbackPage } from "../../callback-page";

export const dynamic = "force-dynamic";

// Where a platform sends the browser after the user approves their own
// developer app (YouTube). Like the Mastodon callback, middleware.ts lets
// this top-level navigation through; the one-time `state` from
// startAppConnect is what proves the request is ours.
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const denied = req.nextUrl.searchParams.get("error");
  const result = denied || !code ? { error: "Kyrelo wasn't approved. You can try again from Kyrelo." } : await finishAppConnect(state, code);
  const label = "platform" in result && result.platform ? PLATFORMS[result.platform].label : "your account";
  const ok = "ok" in result;
  return new Response(
    callbackPage(
      ok ? `${label} connected` : `Couldn't connect ${label}`,
      ok ? `${result.handle} is connected. You can close this tab and go back to Kyrelo.` : result.error,
    ),
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
