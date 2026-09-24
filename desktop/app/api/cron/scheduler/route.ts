import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await runDueScheduledPosts();
  return NextResponse.json(result);
}
