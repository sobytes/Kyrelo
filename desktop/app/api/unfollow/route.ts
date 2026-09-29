import { NextRequest, NextResponse } from "next/server";
import { getGrokSettings, getUnfollowData } from "@/lib/storage";
import {
  getUnfollowJob,
  setKept,
  startActivityCheck,
  startRefollow,
  startScan,
  startUnfollow,
} from "@/lib/unfollow";
import { parseRules } from "@/lib/unfollow-rules";

export const dynamic = "force-dynamic";

// The Unfollow tab. Not reachable from the phone (see lib/mobile-bridge.ts).

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const job = getUnfollowJob();
  if (!accountId) return NextResponse.json({ job });
  const [data, settings] = await Promise.all([getUnfollowData(accountId), getGrokSettings()]);
  return NextResponse.json({ job, data, watched: settings.handles.map((h) => h.toLowerCase()) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    accountId?: string;
    handles?: unknown;
    handle?: string;
    keep?: boolean;
    rules?: unknown;
  };
  if (!body.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  const handles = Array.isArray(body.handles) ? body.handles.filter((h): h is string => typeof h === "string") : [];

  if (body.action === "keep") {
    if (!body.handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
    return NextResponse.json({ data: await setKept(body.accountId, body.handle, body.keep !== false) });
  }

  const result =
    body.action === "scan"
      ? await startScan(body.accountId)
      : body.action === "activity"
        ? await startActivityCheck(body.accountId, handles)
        : body.action === "unfollow"
          ? await startUnfollow(body.accountId, handles, parseRules(body.rules))
          : body.action === "refollow"
            ? await startRefollow(body.accountId, handles)
            : { error: "unknown action" };
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ job: result.job });
}
