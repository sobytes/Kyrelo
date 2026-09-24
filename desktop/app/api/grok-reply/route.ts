import { NextRequest, NextResponse } from "next/server";
import { generateReplyForTweet, markTweetReplied } from "@/lib/grok-watcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "generate" | "mark";
    tweetId?: string;
    replyText?: string;
  };
  if (!body.tweetId) {
    return NextResponse.json({ error: "tweetId required" }, { status: 400 });
  }
  if (body.action === "generate") {
    return NextResponse.json(await generateReplyForTweet(body.tweetId));
  }
  if (body.action === "mark") {
    return NextResponse.json(
      await markTweetReplied(body.tweetId, body.replyText ?? ""),
    );
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
