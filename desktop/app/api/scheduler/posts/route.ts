import { NextRequest, NextResponse } from "next/server";
import { createScheduledPost } from "@/lib/scheduler";
import { listScheduledPosts } from "@/lib/storage";
import { MAX_POST_LENGTH } from "@/lib/tweet";
import { SAFE_IMAGE_FILENAME } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await listScheduledPosts();
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    platform?: "twitter";
    accountId?: string;
    text?: string;
    imagePath?: string;
    scheduledFor?: string;
  };
  const text = body.text?.trim() ?? "";
  if (!text || !body.scheduledFor || body.platform !== "twitter" || !body.accountId) {
    return NextResponse.json(
      { error: "platform, accountId, text, and scheduledFor are required" },
      { status: 400 },
    );
  }
  if (text.length > MAX_POST_LENGTH) {
    return NextResponse.json({ error: `post is over ${MAX_POST_LENGTH} characters` }, { status: 400 });
  }
  if (body.imagePath && !SAFE_IMAGE_FILENAME.test(body.imagePath)) {
    return NextResponse.json({ error: "invalid imagePath" }, { status: 400 });
  }
  const when = new Date(body.scheduledFor);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "invalid scheduledFor date" }, { status: 400 });
  }
  const post = await createScheduledPost({
    platform: body.platform,
    accountId: body.accountId,
    text,
    imagePath: body.imagePath || undefined,
    scheduledFor: when.toISOString(),
  });
  return NextResponse.json({ post });
}
