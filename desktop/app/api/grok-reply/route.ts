import { NextRequest, NextResponse } from "next/server";
import { draftForTweet, markTweetReplied } from "@/lib/grok-watcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "draft" | "mark";
    tweetId?: string;
    replyText?: string;
  };
  if (!body.tweetId) {
    return NextResponse.json({ error: "tweetId required" }, { status: 400 });
  }
  if (body.action === "draft") {
    // The user asked for replies, so draft whatever the score.
    const r = await draftForTweet(body.tweetId, 0);
    return NextResponse.json(r, { status: r.error ? 500 : 200 });
  }
  if (body.action === "mark") {
    return NextResponse.json(
      await markTweetReplied(body.tweetId, body.replyText ?? ""),
    );
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
