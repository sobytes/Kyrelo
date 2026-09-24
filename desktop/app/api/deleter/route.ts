import { NextRequest, NextResponse } from "next/server";
import { getJob, startJob } from "@/lib/deleter";

export const dynamic = "force-dynamic";
// deleteTweets runs for as long as it takes to walk the timeline and delete
// each tweet, so give it plenty of headroom (Next caps individual invocations).
export const maxDuration = 600;

export async function GET() {
  return NextResponse.json({ job: getJob() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    count?: number;
    startingAt?: number;
    includeReposts?: boolean;
  };
  if (!body.accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }
  const result = await startJob({
    accountId: body.accountId,
    count: Number(body.count ?? 0),
    startingAt: Number(body.startingAt ?? 0),
    includeReposts: Boolean(body.includeReposts ?? false),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ job: result.job });
}
