import { NextRequest, NextResponse } from "next/server";
import { createScheduledPost } from "@/lib/scheduler";
import { listScheduledPosts } from "@/lib/storage";
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
  if (!body.text || !body.scheduledFor || !body.platform || !body.accountId) {
    return NextResponse.json(
      { error: "platform, accountId, text, and scheduledFor are required" },
      { status: 400 },
    );
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
    text: body.text.trim(),
    imagePath: body.imagePath || undefined,
    scheduledFor: when.toISOString(),
  });
  return NextResponse.json({ post });
}
