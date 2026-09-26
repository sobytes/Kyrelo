import { NextRequest, NextResponse } from "next/server";
import { listMediaItems, saveMediaItems } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { description?: string };
  const items = await listMediaItems();
  const item = items.find((m) => m.id === id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  item.description = (body.description ?? "").trim();
  await saveMediaItems(items);
  return NextResponse.json({ item });
}

// Removes the image from the library only. The file stays on disk because
// already-scheduled posts may still reference it.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await saveMediaItems((await listMediaItems()).filter((m) => m.id !== id));
  return NextResponse.json({ ok: true });
}
