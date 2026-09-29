import { NextRequest, NextResponse } from "next/server";
import { connectBluesky, disconnectAccount } from "@/lib/accounts";
import {
  cancelBrowserConnect,
  connectingPlatform,
  endBrowserConnect,
  startBrowserConnect,
} from "@/lib/browser-connect";
import { isPlatformId } from "@/lib/platforms";
import { listAccounts } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Accounts on every platform. Never returns credentials: listAccounts() holds
// none (Bluesky app passwords live in account-secrets, see lib/storage.ts).
export async function GET() {
  return NextResponse.json({
    accounts: await listAccounts(),
    connecting: connectingPlatform(),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    platform?: string;
    accountId?: string;
    handle?: string;
    appPassword?: string;
  };
  try {
    switch (body.action) {
      // Browser login (X): start opens Chrome, done saves the session.
      case "start":
        if (!isPlatformId(body.platform)) return badRequest("unknown platform");
        return NextResponse.json(await startBrowserConnect(body.platform));
      case "done":
        return NextResponse.json(await endBrowserConnect());
      case "cancel":
        return NextResponse.json(await cancelBrowserConnect());
      // App-password login (Bluesky).
      case "connect-bluesky":
        return NextResponse.json(await connectBluesky(body.handle ?? "", body.appPassword ?? ""));
      case "disconnect":
        if (!isPlatformId(body.platform) || !body.accountId) return badRequest("platform and accountId required");
        return NextResponse.json(await disconnectAccount(body.platform, body.accountId));
      default:
        return badRequest("unknown action");
    }
  } catch (err) {
    // Always answer with JSON — an unhandled throw here would otherwise send an
    // empty/HTML 500 that crashes the client's response.json() parse.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[accounts] route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
