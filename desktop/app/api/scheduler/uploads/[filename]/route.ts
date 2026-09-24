import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Filenames written by /api/scheduler/upload are always randomUUID + a short
// image extension. Reject anything that doesn't match — strict whitelist beats
// the slash/dot blocklist (and handles Windows backslashes for free).
const SAFE_FILENAME = /^[A-Za-z0-9_\-]{6,}\.(png|jpg|jpeg|gif|webp)$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;
  if (!SAFE_FILENAME.test(filename)) {
    return new Response("bad filename", { status: 400 });
  }
  const root = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data");
  const dir = path.resolve(root, "uploads");
  const file = path.resolve(dir, filename);
  // Belt-and-braces: make sure the resolved path is still inside uploads/.
  if (!file.startsWith(dir + path.sep) && file !== dir) {
    return new Response("bad filename", { status: 400 });
  }
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return new Response("not found", { status: 404 });
  }
  const ext = path.extname(filename).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=300",
    },
  });
}
