import { NextResponse } from "next/server";
import { getGrokState, saveGrokState } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ state: await getGrokState() });
}

export async function DELETE() {
  await saveGrokState({ bootstrapped: false, tweets: [] });
  return NextResponse.json({ ok: true });
}
