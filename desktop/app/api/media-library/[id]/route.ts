import { NextRequest, NextResponse } from "next/server";
import { removeMediaItem, updateMediaItem } from "@/lib/media-library";

export const dynamic = "force-dynamic";

/** Changes the description, or which buckets the item is in. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { description?: unknown; bucketIds?: unknown };
  const item = await updateMediaItem(id, {
    description: typeof body.description === "string" ? body.description : undefined,
    bucketIds: Array.isArray(body.bucketIds) ? body.bucketIds.filter((b): b is string => typeof b === "string") : undefined,
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item });
}

// Removes the item from the library only. The file stays on disk because
// already-scheduled posts may still reference it.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await removeMediaItem(id);
  return NextResponse.json({ ok: true });
}
