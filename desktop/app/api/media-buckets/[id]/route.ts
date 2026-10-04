import { NextRequest, NextResponse } from "next/server";
import { deleteBucket, renameBucket } from "@/lib/media-library";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  try {
    const bucket = await renameBucket(id, String(body.name ?? ""));
    if (!bucket) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ bucket });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** Deletes the bucket only: its media stays in the library. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteBucket(id);
  return NextResponse.json({ ok: true });
}
