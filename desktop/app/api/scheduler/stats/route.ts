import { NextResponse } from "next/server";
import { refreshStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The Scheduler's "Refresh stats": every sent post from the last month, now. */
export async function POST() {
  return NextResponse.json(await refreshStats({ force: true }));
}
