import { NextRequest, NextResponse } from "next/server";
import { adaptPost, aiErrorMessage, rewritePost } from "@/lib/ai";
import { isPlatformId } from "@/lib/platforms";
import { getGrokSettings } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    platform?: string;
    /** "adapt": suit the platform's length and style (per-account text). Default: reword. */
    mode?: "rewrite" | "adapt";
  };
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const settings = await getGrokSettings();
  try {
    const text = await (body.mode === "adapt" ? adaptPost : rewritePost)({
      text: body.text,
      provider: settings.aiProvider,
      platform: isPlatformId(body.platform) ? body.platform : "twitter",
    });
    return NextResponse.json({ ok: true, text, provider: settings.aiProvider });
  } catch (err) {
    return NextResponse.json({ ok: false, error: aiErrorMessage(err) }, { status: 500 });
  }
}
