import { NextResponse } from "next/server";
import { cancelScheduledPost } from "@/lib/scheduler";
import { listAccounts, listScheduledPosts, updateScheduledPost } from "@/lib/storage";
import { PLATFORMS, postTextError } from "@/lib/platforms";
import { SAFE_IMAGE_FILENAME } from "@/lib/uploads";

export const dynamic = "force-dynamic";

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

  // A post's platform never changes, so its rules can be checked up front.
  const existing = (await listScheduledPosts()).find((p) => p.id === id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Same rules as creating a post (../route.ts).
  const text = typeof body.text === "string" ? body.text.trim() : undefined;
  const textError = text !== undefined ? postTextError(existing.platform, text) : null;
  if (textError) return NextResponse.json({ error: textError }, { status: 400 });
  if (
    typeof body.accountId === "string" &&
    body.accountId &&
    !(await listAccounts(existing.platform)).some((a) => a.id === body.accountId)
  ) {
    return NextResponse.json({ error: "that account isn't connected on this post's platform" }, { status: 400 });
  }
  const when = typeof body.scheduledFor === "string" ? new Date(body.scheduledFor) : undefined;
  if (when && Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "invalid scheduledFor date" }, { status: 400 });
  }
  if (body.imagePath && !SAFE_IMAGE_FILENAME.test(body.imagePath)) {
    return NextResponse.json({ error: "invalid imagePath" }, { status: 400 });
  }
  if (body.imagePath && PLATFORMS[existing.platform].maxImageBytes === 0) {
    return NextResponse.json({ error: `Kyrelo can't post images to ${PLATFORMS[existing.platform].label}` }, { status: 400 });
  }

  // Applied to the latest stored copy, and only while it is still pending:
  // the scheduler may have started sending it since the user opened the editor.
  let found = false;
  const post = await updateScheduledPost(id, (latest) => {
    found = true;
    if (latest.status !== "pending") return null;
    const next = { ...latest };
    if (text !== undefined) {
      next.text = text;
    }
    if (typeof body.accountId === "string" && body.accountId) {
      next.accountId = body.accountId;
    }
    if (when) {
      next.scheduledFor = when.toISOString();
    }
    if ("imagePath" in body) {
      next.imagePath = body.imagePath ? body.imagePath : undefined;
    }
    return next;
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!post) {
    return NextResponse.json(
      { error: "Only pending posts can be edited." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, post });
}
