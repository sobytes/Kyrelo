import { NextRequest, NextResponse } from "next/server";
import { getApiKeys, saveApiKeys } from "@/lib/storage";
import { ApiKeys } from "@/lib/types";

export const dynamic = "force-dynamic";

// Returns flags only — never the raw secrets, so a compromised tab can't read them back.
export async function GET() {
  const stored = await getApiKeys();
  return NextResponse.json({
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY || stored.anthropic),
    openai: Boolean(process.env.OPENAI_API_KEY || stored.openai),
    anthropicFromEnv: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiFromEnv: Boolean(process.env.OPENAI_API_KEY),
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ApiKeys>;
  const current = await getApiKeys();
  const next: ApiKeys = { ...current };
  if (typeof body.anthropic === "string") {
    next.anthropic = body.anthropic.trim() || undefined;
  }
  if (typeof body.openai === "string") {
    next.openai = body.openai.trim() || undefined;
  }
  await saveApiKeys(next);
  return NextResponse.json({ ok: true });
}
