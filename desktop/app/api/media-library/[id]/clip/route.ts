import { NextRequest, NextResponse } from "next/server";
import { clipMediaItem } from "@/lib/media-library";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

/** Cuts a clip (start–end, in seconds) from a library video into a new item. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { start?: unknown; end?: unknown };
  const start = Number(body.start);
  const end = Number(body.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NextResponse.json({ error: "start and end required" }, { status: 400 });
  try {
    return NextResponse.json({ item: await clipMediaItem(id, start, end) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
