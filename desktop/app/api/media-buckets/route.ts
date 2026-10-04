import { NextRequest, NextResponse } from "next/server";
import { createBucket } from "@/lib/media-library";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  try {
    return NextResponse.json({ bucket: await createBucket(String(body.name ?? "")) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
