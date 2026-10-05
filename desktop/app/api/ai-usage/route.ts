import { NextRequest, NextResponse } from "next/server";
import { aiUsageToday, setDailyDraftLimit } from "@/lib/ai-usage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await aiUsageToday());
}

/** Sets how many background AI drafts (Autopilot, Comments) may be made a day. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { dailyDraftLimit?: unknown };
  const limit = Number(body.dailyDraftLimit);
  if (!Number.isFinite(limit) || limit < 0) return NextResponse.json({ error: "dailyDraftLimit must be 0 or more" }, { status: 400 });
  await setDailyDraftLimit(limit);
  return NextResponse.json(await aiUsageToday());
}
