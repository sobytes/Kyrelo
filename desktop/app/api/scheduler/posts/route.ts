import { NextRequest, NextResponse } from "next/server";
import { createScheduledPost, postMediaError } from "@/lib/scheduler";
import { isPlatformId, postTextError } from "@/lib/platforms";
import { listAccounts, listScheduledPosts } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await listScheduledPosts();
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    platform?: string;
    accountId?: string;
    text?: string;
    imagePath?: string;
    videoPath?: string;
    scheduledFor?: string;
  };
  const text = body.text?.trim() ?? "";
  const platform = body.platform;
  if (!isPlatformId(platform) || !body.accountId || !body.scheduledFor) {
    return NextResponse.json(
      { error: "platform, accountId, text, and scheduledFor are required" },
      { status: 400 },
    );
  }
  const textError = postTextError(platform, text);
  if (textError) return NextResponse.json({ error: textError }, { status: 400 });
  if (!(await listAccounts(platform)).some((a) => a.id === body.accountId)) {
    return NextResponse.json({ error: "that account isn't connected" }, { status: 400 });
  }
  const mediaError = await postMediaError(platform, body.imagePath || undefined, body.videoPath || undefined, body.accountId);
  if (mediaError) return NextResponse.json({ error: mediaError }, { status: 400 });
  const when = new Date(body.scheduledFor);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "invalid scheduledFor date" }, { status: 400 });
  }
  const post = await createScheduledPost({
    platform,
    accountId: body.accountId,
    text,
    imagePath: body.imagePath || undefined,
    videoPath: body.videoPath || undefined,
    scheduledFor: when.toISOString(),
  });
  return NextResponse.json({ post });
}
