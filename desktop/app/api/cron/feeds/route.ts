import { NextResponse } from "next/server";
import { runFeedsCheck } from "@/lib/feeds";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(await runFeedsCheck());
}
