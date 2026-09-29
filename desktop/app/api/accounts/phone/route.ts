import { NextRequest, NextResponse } from "next/server";
import { connectWithCredentials, finishMastodonConnect, PHONE_MASTODON_REDIRECT, startMastodonConnect } from "@/lib/accounts";
import { isPlatformId } from "@/lib/platforms";

export const dynamic = "force-dynamic";

// Connecting an account from the paired phone: the part of /api/accounts the
// phone bridge lets through. Adding only, never disconnecting, and not X,
// whose sign-in happens in Chrome on this computer.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    platform?: string;
    fields?: Record<string, unknown>;
    server?: string;
    state?: string;
    code?: string;
  };
  switch (body.action) {
    // Credentials typed on the phone (Bluesky, Threads), checked the same way.
    case "connect": {
      if (!isPlatformId(body.platform)) return badRequest("unknown platform");
      const fields = Object.fromEntries(
        Object.entries(body.fields ?? {}).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
      return NextResponse.json(await connectWithCredentials(body.platform, fields));
    }
    // Mastodon: the phone opens the page, the server redirects to the phone
    // app, and the phone hands the code back here.
    case "mastodon-start":
      return NextResponse.json(await startMastodonConnect(body.server ?? "", PHONE_MASTODON_REDIRECT));
    case "mastodon-finish":
      if (!body.state || !body.code) return badRequest("state and code required");
      return NextResponse.json(await finishMastodonConnect(body.state, body.code));
    default:
      return badRequest("unknown action");
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
