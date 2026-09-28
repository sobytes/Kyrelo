import { NextRequest, NextResponse } from "next/server";
import { IMAGE_EXT_BY_TYPE, imageUploadError, saveImage } from "@/lib/uploads";

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
  const invalid = imageUploadError(file);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const filename = await saveImage(Buffer.from(await file.arrayBuffer()), IMAGE_EXT_BY_TYPE[file.type]);
  return NextResponse.json({ ok: true, filename });
}
