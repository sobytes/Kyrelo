import { NextRequest, NextResponse } from "next/server";
import {
  getGrokSettings,
  saveGrokSettings,
  modifyGrokState,
} from "@/lib/storage";
import { GrokSettings } from "@/lib/types";

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
