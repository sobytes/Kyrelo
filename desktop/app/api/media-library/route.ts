import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { describeImage } from "@/lib/campaign-ai";
import { IMAGE_EXT_BY_TYPE, imageUploadError, saveImage } from "@/lib/uploads";
import { getGrokSettings, listMediaItems, modifyMediaItems } from "@/lib/storage";
import { MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CaptionImageType = Parameters<typeof describeImage>[1];

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
  const invalid = imageUploadError(file);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const filename = await saveImage(data, IMAGE_EXT_BY_TYPE[file.type]);

  // No caption given: have the AI write one so the campaign writer knows what
  // the image shows. Best-effort — without a key the user can still type one.
  let description = String(form.get("description") ?? "").trim();
  if (!description) {
    try {
      const settings = await getGrokSettings();
      description = await describeImage(data, file.type as CaptionImageType, settings.aiProvider);
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
  await modifyMediaItems((items) => [...items, item]);
  return NextResponse.json({ item });
}
