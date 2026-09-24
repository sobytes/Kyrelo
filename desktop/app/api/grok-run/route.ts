import { NextResponse } from "next/server";
import { runGrokWatcher } from "@/lib/grok-watcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Same-origin manual trigger for the "Run now" button. Not protected by
// CRON_SECRET — assumes the dashboard itself is the trust boundary.
export async function POST() {
  const result = await runGrokWatcher();
  return NextResponse.json(result);
}
