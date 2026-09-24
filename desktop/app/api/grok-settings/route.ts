import { NextRequest, NextResponse } from "next/server";
import {
  getGrokSettings,
  saveGrokSettings,
  saveGrokState,
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
  const patch = (await req.json()) as Partial<GrokSettings>;
  const next: GrokSettings = {
    ...current,
    ...patch,
    handles: patch.handles ? normalize(patch.handles) : current.handles,
  };
  await saveGrokSettings(next);

  // If the watched handles list changed, drop seen-tweet state so stale
  // tweets from old handles don't linger in the feed.
  const sameHandles =
    current.handles.length === next.handles.length &&
    current.handles.every((h, i) => h.toLowerCase() === next.handles[i].toLowerCase());
  if (!sameHandles) {
    await saveGrokState({ bootstrapped: false, tweets: [] });
  }

  return NextResponse.json({ settings: next });
}
