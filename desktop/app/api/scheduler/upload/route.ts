import { NextRequest, NextResponse } from "next/server";
import { saveUpload, uploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const invalid = uploadError(file);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  try {
    // Stored by what the bytes are, not the type the upload claims.
    const filename = await saveUpload(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
