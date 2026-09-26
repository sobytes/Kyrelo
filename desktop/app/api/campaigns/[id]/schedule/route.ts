import { NextRequest, NextResponse } from "next/server";
import { DraftEdit, scheduleCampaign } from "@/lib/campaign";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { drafts?: DraftEdit[] };
  if (!Array.isArray(body.drafts)) {
    return NextResponse.json({ error: "drafts required" }, { status: 400 });
  }
  try {
    const campaign = await scheduleCampaign(id, body.drafts);
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
