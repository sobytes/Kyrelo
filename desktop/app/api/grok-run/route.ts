import { NextResponse } from "next/server";
import { runGrokWatcher } from "@/lib/grok-watcher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual trigger for the Monitor page's "Run now" button. middleware.ts
// restricts every /api route to the app's own window and worker.
export async function POST() {
  const result = await runGrokWatcher({ force: true });
  return NextResponse.json(result);
}
