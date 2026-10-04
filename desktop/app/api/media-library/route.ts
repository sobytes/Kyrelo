import { NextRequest, NextResponse } from "next/server";
import { addMediaItem } from "@/lib/media-library";
import { listMediaBuckets, listMediaItems } from "@/lib/storage";
import { imageUploadError, uploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The library, newest first, and its buckets. */
export async function GET() {
  const [items, buckets] = await Promise.all([listMediaItems(), listMediaBuckets()]);
  return NextResponse.json({ items: items.reverse(), buckets });
}

/**
 * Adds an image or video. Images get an AI description unless one is given;
 * a video's optional `poster` (a still frame, JPEG or PNG) is described
 * instead. `bucketId` puts it in that bucket.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  const invalid = uploadError(file);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const poster = form.get("poster");
  if (poster instanceof File && imageUploadError(poster)) {
    return NextResponse.json({ error: `poster: ${imageUploadError(poster)}` }, { status: 400 });
  }
  try {
    const item = await addMediaItem(Buffer.from(await file.arrayBuffer()), {
      description: String(form.get("description") ?? ""),
      bucketId: String(form.get("bucketId") ?? "") || undefined,
      poster: poster instanceof File ? Buffer.from(await poster.arrayBuffer()) : undefined,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
