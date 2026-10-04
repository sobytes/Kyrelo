import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  imageTypeForFilename,
  SAFE_IMAGE_FILENAME,
  SAFE_VIDEO_FILENAME,
  uploadsDir,
  videoTypeForFilename,
} from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;
  if (!SAFE_IMAGE_FILENAME.test(filename) && !SAFE_VIDEO_FILENAME.test(filename)) {
    return new Response("bad filename", { status: 400 });
  }
  const dir = path.resolve(uploadsDir());
  const file = path.resolve(dir, filename);
  // Belt-and-braces: make sure the resolved path is still inside uploads/.
  if (!file.startsWith(dir + path.sep) && file !== dir) {
    return new Response("bad filename", { status: 400 });
  }
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response("not found", { status: 404 });
  }
  const type = imageTypeForFilename(filename) ?? videoTypeForFilename(filename) ?? "application/octet-stream";
  // Streamed: a video can be hundreds of MB.
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      // Never let a browser guess the type from the bytes.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
