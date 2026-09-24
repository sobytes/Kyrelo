import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

function uploadsDir(): string {
  const root = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data");
  return path.join(root, "uploads");
}

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
  if (!/^image\//.test(file.type)) {
    return NextResponse.json({ error: "must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${Math.round(file.size / 1024 / 1024)} MB; max 10 MB)` },
      { status: 400 },
    );
  }
  const safeExt = (path.extname(file.name) || ".png").toLowerCase().slice(0, 5);
  const filename = `${randomUUID()}${safeExt}`;
  const dir = uploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(dest, buffer);
  return NextResponse.json({ ok: true, filename });
}
