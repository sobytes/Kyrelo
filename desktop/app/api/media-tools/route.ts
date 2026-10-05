import { NextResponse } from "next/server";
import { hasFfmpeg } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";

/** What this computer can do with videos: with ffmpeg, fit them to each platform and cut clips. */
export async function GET() {
  return NextResponse.json({ ffmpeg: hasFfmpeg() });
}
