import { NextRequest, NextResponse } from "next/server";
import {
  cancelTwitterConnect,
  disconnectXAccount,
  endTwitterConnect,
  isConnectActive,
  listXConnectedAccounts,
  startTwitterConnect,
} from "@/lib/twitter-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const accounts = await listXConnectedAccounts();
  return NextResponse.json({
    accounts,
    connecting: isConnectActive(),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    accountId?: string;
  };
  try {
    if (body.action === "start") {
      return NextResponse.json(await startTwitterConnect());
    }
    if (body.action === "done") {
      return NextResponse.json(await endTwitterConnect());
    }
    if (body.action === "cancel") {
      return NextResponse.json(await cancelTwitterConnect());
    }
    if (body.action === "disconnect") {
      if (!body.accountId) {
        return NextResponse.json({ error: "accountId required" }, { status: 400 });
      }
      return NextResponse.json(await disconnectXAccount(body.accountId));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    // Always answer with JSON — an unhandled throw here would otherwise send an
    // empty/HTML 500 that crashes the client's response.json() parse.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[twitter-connect] route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
