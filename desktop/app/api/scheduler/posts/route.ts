import { NextRequest, NextResponse } from "next/server";
import { createScheduledPost } from "@/lib/scheduler";
import { listScheduledPosts } from "@/lib/storage";

export const dynamic = "force-dynamic";

// imagePath must match what /api/scheduler/upload wrote — basename only,
// random suffix + image extension. Anything else (path separators, dotfiles,
// arbitrary disk paths) is rejected so the scheduler can't be tricked into
// attaching a file from outside the uploads/ dir.
const SAFE_IMAGE_PATH = /^[A-Za-z0-9_\-]{6,}\.(png|jpg|jpeg|gif|webp)$/i;

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
  if (body.imagePath && !SAFE_IMAGE_PATH.test(body.imagePath)) {
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
