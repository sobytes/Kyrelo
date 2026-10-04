import { NextResponse } from "next/server";
import { refreshStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(await refreshStats());
}
