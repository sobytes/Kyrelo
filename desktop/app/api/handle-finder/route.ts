import { NextRequest, NextResponse } from "next/server";
import { hasApiKey } from "@/lib/ai";
import { getFinderJob, startFind, startFollow } from "@/lib/handle-finder";
import { getBrandProfile, getGrokSettings, getHandleFinderData } from "@/lib/storage";

export const dynamic = "force-dynamic";

// The Monitor's "Find accounts for my brand". Not reachable from the phone
// (see lib/mobile-bridge.ts).

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const job = getFinderJob();
  if (!accountId) return NextResponse.json({ job });
  const [data, profile, settings] = await Promise.all([
    getHandleFinderData(accountId),
    getBrandProfile(),
    getGrokSettings(),
  ]);
  const aiReady = await hasApiKey(settings.aiProvider === "openai" ? "openai" : "anthropic");
  return NextResponse.json({ job, data, profile, aiReady });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    accountId?: string;
    handles?: unknown;
    brief?: unknown;
    url?: unknown;
    competitors?: unknown;
  };
  if (!body.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  let result;
  if (body.action === "find") {
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const url = text(body.url);
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "link must start with http:// or https://" }, { status: 400 });
    }
    // The window always sends the profile; a request without one keeps the saved one.
    const profile =
      typeof body.brief === "string" ? { brief: text(body.brief), url, competitors: text(body.competitors) } : undefined;
    result = await startFind(body.accountId, profile);
  } else if (body.action === "follow") {
    const handles = Array.isArray(body.handles) ? body.handles.filter((h): h is string => typeof h === "string") : [];
    result = await startFollow(body.accountId, handles);
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ job: result.job });
}
