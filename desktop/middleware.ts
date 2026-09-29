import { NextRequest, NextResponse } from "next/server";

// The API is only for this app's own window and background worker. Without
// this check any website open in the user's browser could POST to
// http://127.0.0.1:<port>/api/... (a text/plain body is a "simple" request
// with no CORS preflight, and the routes parse it as JSON anyway) and schedule
// posts, run the tweet deleter or spend AI credits.
//
// - Host must be loopback, which defeats DNS-rebinding (evil.com → 127.0.0.1).
// - Browsers label cross-site requests via Sec-Fetch-Site and Origin; reject
//   anything not same-origin. The worker and server-side fetches send neither.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const OAUTH_CALLBACK = "/api/accounts/mastodon/callback";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) return forbidden("bad host");

  // The one page other sites send the browser to: the user's Mastodon server
  // after they approve Kyrelo. A plain navigation that changes nothing unless
  // it carries the one-time state Kyrelo just issued (lib/accounts.ts).
  if (req.method === "GET" && req.nextUrl.pathname === OAUTH_CALLBACK) return NextResponse.next();

  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return forbidden("cross-site request");

  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return forbidden("bad origin");
    }
    if (originHost !== host) return forbidden("cross-origin request");
  } else if (origin === "null") {
    return forbidden("opaque origin");
  }

  return NextResponse.next();
}

function forbidden(reason: string) {
  return NextResponse.json({ error: `forbidden: ${reason}` }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
