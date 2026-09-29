import { NextRequest, NextResponse } from "next/server";
import { getGrokSettings, getUnfollowData } from "@/lib/storage";
import {
  getUnfollowJob,
  unfollowContext,
  setKept,
  startActivityCheck,
  startRefollow,
  startScan,
  startUnfollow,
} from "@/lib/unfollow";
import { needsActivityCheck, parseRules, protectionReason, unfollowReasons } from "@/lib/unfollow-rules";

export const dynamic = "force-dynamic";

// The Unfollow section, for the desktop and (through lib/mobile-bridge.ts)
// the phone.
//
// With `rules` (JSON, see parseRules) the answer also has `rows`: each
// followed account with the reasons the rules give and why it's kept, if it
// is. The phone shows those rather than re-implementing the rules.

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const job = getUnfollowJob();
  if (!accountId) return NextResponse.json({ job });
  const [data, settings] = await Promise.all([getUnfollowData(accountId), getGrokSettings()]);
  const rawRules = req.nextUrl.searchParams.get("rules");
  if (!rawRules) return NextResponse.json({ job, data, watched: settings.handles.map((h) => h.toLowerCase()) });

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(rawRules);
  } catch {
    // Unreadable rules: the defaults.
  }
  const rules = parseRules(parsed);
  const ctx = await unfollowContext(data);
  const rows = data.following.map((a) => ({
    handle: a.handle,
    name: a.name,
    followers: a.followers,
    following: a.following,
    posts: a.posts,
    followsYou: a.followsYou,
    lastPostAt: a.lastPostAt,
    kept: data.keep.includes(a.handle.toLowerCase()),
    reasons: unfollowReasons(a, rules, ctx),
    protectedBecause: protectionReason(a, rules, ctx),
    needsActivityCheck: needsActivityCheck(a, ctx.now),
  }));
  return NextResponse.json({
    job,
    rules,
    scannedAt: data.scannedAt ?? null,
    hasStats: data.hasStats,
    partial: data.partial,
    rows,
    history: data.history.slice(-50).reverse(),
  });
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
