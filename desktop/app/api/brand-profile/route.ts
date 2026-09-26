import { NextResponse } from "next/server";
import { getBrandProfile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Saved by POST /api/campaigns each time a campaign starts.
export async function GET() {
  return NextResponse.json({ profile: await getBrandProfile() });
}
