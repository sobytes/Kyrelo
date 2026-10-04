import { NextResponse } from "next/server";
import { runCommentsCheck } from "@/lib/comments";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json(await runCommentsCheck());
}
