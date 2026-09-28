import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { IMAGE_EXT_BY_TYPE, MAX_IMAGE_BYTES, uploadsDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `invalid form data: ${msg}` }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  const ext = IMAGE_EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json({ error: "use a PNG, JPEG, GIF or WebP image" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `file too large (${Math.round(file.size / 1024 / 1024)} MB; max 5 MB)` },
      { status: 400 },
    );
  }
  const filename = `${randomUUID()}${ext}`;
  const dir = uploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(dest, buffer);
  return NextResponse.json({ ok: true, filename });
}
