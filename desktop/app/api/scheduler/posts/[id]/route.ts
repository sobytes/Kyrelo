import { NextResponse } from "next/server";
import { cancelScheduledPost } from "@/lib/scheduler";
import { updateScheduledPost } from "@/lib/storage";
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

  if (body.imagePath && !SAFE_IMAGE_FILENAME.test(body.imagePath)) {
    return NextResponse.json({ error: "invalid imagePath" }, { status: 400 });
  }

  // Applied to the latest stored copy, and only while it is still pending:
  // the scheduler may have started sending it since the user opened the editor.
  let found = false;
  const post = await updateScheduledPost(id, (latest) => {
    found = true;
    if (latest.status !== "pending") return null;
    const next = { ...latest };
    if (typeof body.text === "string") {
      next.text = body.text.trim();
    }
    if (typeof body.accountId === "string" && body.accountId) {
      next.accountId = body.accountId;
    }
    if (typeof body.scheduledFor === "string") {
      const d = new Date(body.scheduledFor);
      if (!Number.isNaN(d.getTime())) next.scheduledFor = d.toISOString();
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
