import { NextRequest, NextResponse } from "next/server";
import {
  getGrokSettings,
  saveGrokSettings,
  modifyGrokState,
} from "@/lib/storage";
import { AutopilotSettings, GrokSettings, REPLY_STYLES, REPLY_TONES } from "@/lib/types";

function normalize(handles: string[]): string[] {
  return Array.from(
    new Set(
      handles
        .map((h) => (h ?? "").trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  );
}

export async function GET() {
  return NextResponse.json({ settings: await getGrokSettings() });
}

export async function PUT(req: NextRequest) {
  const current = await getGrokSettings();
  const patch = (await req.json().catch(() => null)) as Partial<GrokSettings> | null;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (patch.handles !== undefined && !Array.isArray(patch.handles)) {
    return NextResponse.json({ error: "handles must be a list" }, { status: 400 });
  }
  if (patch.aiProvider !== undefined && patch.aiProvider !== "claude" && patch.aiProvider !== "openai") {
    return NextResponse.json({ error: "aiProvider must be claude or openai" }, { status: 400 });
  }
  // Copy known fields only, so a stray key can't end up in settings.json.
  const next: GrokSettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    handles: patch.handles ? normalize(patch.handles.map(String)) : current.handles,
    includeReplies: typeof patch.includeReplies === "boolean" ? patch.includeReplies : current.includeReplies,
    aiProvider: patch.aiProvider ?? current.aiProvider,
    styleHint: typeof patch.styleHint === "string" ? patch.styleHint : current.styleHint,
    notifyDesktop: typeof patch.notifyDesktop === "boolean" ? patch.notifyDesktop : current.notifyDesktop,
    headlessPosting:
      typeof patch.headlessPosting === "boolean" ? patch.headlessPosting : current.headlessPosting,
    autopilot: mergeAutopilot(current.autopilot, patch.autopilot),
  };
  await saveGrokSettings(next);

  // If the watched handles list changed, drop seen-tweet state so stale
  // tweets from old handles don't linger in the feed.
  const sameHandles =
    current.handles.length === next.handles.length &&
    current.handles.every((h, i) => h.toLowerCase() === next.handles[i].toLowerCase());
  if (!sameHandles) {
    await modifyGrokState(() => ({ bootstrapped: false, tweets: [] }));
  }

  return NextResponse.json({ settings: next });
}

/** Known Autopilot fields only, with enums checked and numbers clamped. */
function mergeAutopilot(current: AutopilotSettings, patch: unknown): AutopilotSettings {
  if (!patch || typeof patch !== "object") return current;
  const p = patch as Partial<Record<keyof AutopilotSettings, unknown>>;
  const clamp = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const text = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 500) : fallback);
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : current.enabled,
    tone: REPLY_TONES.includes(p.tone as never) ? (p.tone as AutopilotSettings["tone"]) : current.tone,
    style: REPLY_STYLES.includes(p.style as never) ? (p.style as AutopilotSettings["style"]) : current.style,
    minScore: Math.round(clamp(p.minScore, 0, 100, current.minScore)),
    creativity: clamp(p.creativity, 0, 1, current.creativity),
    topics: text(p.topics, current.topics),
    avoid: text(p.avoid, current.avoid),
  };
}
