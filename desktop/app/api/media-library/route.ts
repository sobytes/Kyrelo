import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describeImage } from "@/lib/campaign-ai";
import { uploadsDir } from "@/lib/media";
import { getGrokSettings, listMediaItems, saveMediaItems } from "@/lib/storage";
import { MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// X accepts these; 5 MB keeps them under X's and the AI captioners' limits.
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
} as const;
type ImageType = keyof typeof TYPES;

export async function GET() {
  return NextResponse.json({ items: (await listMediaItems()).reverse() });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (!(file.type in TYPES)) {
    return NextResponse.json({ error: "use a PNG, JPEG, GIF or WebP image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "image must be 5 MB or smaller" }, { status: 400 });
  }
  const type = file.type as ImageType;
  const data = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}${TYPES[type]}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), filename), data);

  // No caption given: have the AI write one so the campaign writer knows what
  // the image shows. Best-effort — without a key the user can still type one.
  let description = String(form.get("description") ?? "").trim();
  if (!description) {
    try {
      const settings = await getGrokSettings();
      description = await describeImage(data, type, settings.aiProvider);
    } catch (err) {
      console.warn("[media-library] auto-caption failed:", err instanceof Error ? err.message : err);
    }
  }

  const item: MediaItem = {
    id: randomUUID().slice(0, 8),
    filename,
    description,
    addedAt: new Date().toISOString(),
  };
  await saveMediaItems([...(await listMediaItems()), item]);
  return NextResponse.json({ item });
}
