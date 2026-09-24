import { NextResponse } from "next/server";
import { runGrokWatcher } from "@/lib/grok-watcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const result = await runGrokWatcher();
  return NextResponse.json(result);
}
