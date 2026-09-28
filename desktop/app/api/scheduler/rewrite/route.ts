import { NextRequest, NextResponse } from "next/server";
import { rewritePost } from "@/lib/ai";
import { isPlatformId } from "@/lib/platforms";
import { getGrokSettings } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; platform?: string };
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const settings = await getGrokSettings();
  try {
    const text = await rewritePost({
      text: body.text,
      provider: settings.aiProvider,
      platform: isPlatformId(body.platform) ? body.platform : "twitter",
    });
    return NextResponse.json({ ok: true, text, provider: settings.aiProvider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
