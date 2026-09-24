import { NextResponse } from "next/server";
import { cancelScheduledPost } from "@/lib/scheduler";
import { listScheduledPosts, upsertScheduledPost } from "@/lib/storage";

export const dynamic = "force-dynamic";

const SAFE_IMAGE_PATH = /^[A-Za-z0-9_\-]{6,}\.(png|jpg|jpeg|gif|webp)$/i;

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await cancelScheduledPost(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    accountId?: string;
    imagePath?: string | null;
    scheduledFor?: string;
  };

  const all = await listScheduledPosts();
  const post = all.find((p) => p.id === id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending posts can be edited." },
      { status: 400 },
    );
  }

  if (typeof body.text === "string") {
    post.text = body.text.trim();
  }
  if (typeof body.accountId === "string" && body.accountId) {
    post.accountId = body.accountId;
  }
  if (typeof body.scheduledFor === "string") {
    const d = new Date(body.scheduledFor);
    if (!Number.isNaN(d.getTime())) post.scheduledFor = d.toISOString();
  }
  if ("imagePath" in body) {
    if (body.imagePath && !SAFE_IMAGE_PATH.test(body.imagePath)) {
      return NextResponse.json({ error: "invalid imagePath" }, { status: 400 });
    }
    post.imagePath = body.imagePath ? body.imagePath : undefined;
  }

  await upsertScheduledPost(post);
  return NextResponse.json({ ok: true, post });
}
