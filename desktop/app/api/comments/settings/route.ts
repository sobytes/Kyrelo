import { NextRequest, NextResponse } from "next/server";
import { getCommentSettings, saveCommentSettings } from "@/lib/storage";
import { CommentSettings, REPLY_TONES } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ settings: await getCommentSettings() });
}

export async function PUT(req: NextRequest) {
  const current = await getCommentSettings();
  const patch = (await req.json().catch(() => null)) as Partial<Record<keyof CommentSettings, unknown>> | null;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  // Copy known fields only, so a stray key can't end up in the file.
  const next: CommentSettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    tone: REPLY_TONES.includes(patch.tone as never) ? (patch.tone as CommentSettings["tone"]) : current.tone,
    voiceNotes: typeof patch.voiceNotes === "string" ? patch.voiceNotes.slice(0, 500) : current.voiceNotes,
    minScore:
      typeof patch.minScore === "number" && Number.isFinite(patch.minScore)
        ? Math.round(Math.min(100, Math.max(0, patch.minScore)))
        : current.minScore,
  };
  await saveCommentSettings(next);
  return NextResponse.json({ settings: next });
}
