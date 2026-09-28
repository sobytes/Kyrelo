import { NextResponse } from "next/server";
import { getGrokState, modifyGrokState } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ state: await getGrokState() });
}

export async function DELETE() {
  await modifyGrokState(() => ({ bootstrapped: false, tweets: [] }));
  return NextResponse.json({ ok: true });
}
