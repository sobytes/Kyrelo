import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./storage";

// One set of rules for image files, shared by every route that writes, serves
// or attaches them. Upload and schedule used to disagree (uploads accepted any
// image/* up to 10 MB; scheduling only png/jpg/gif/webp), so a HEIC upload
// succeeded and then failed at "Schedule".

/** Image types X accepts for posts, with the extension we store them under. */
export const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** X's limit for photos. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Stored filenames are always a random UUID plus an extension from the map
 * above. Anything else (path separators, dotfiles, other types) is rejected,
 * so a request can't point the app at a file outside uploads/.
 */
export const SAFE_IMAGE_FILENAME = /^[A-Za-z0-9_-]{6,}\.(png|jpg|jpeg|gif|webp)$/i;

/** Content type for serving a stored file, from its extension. */
export function imageTypeForFilename(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpeg") return "image/jpeg";
  return Object.keys(IMAGE_EXT_BY_TYPE).find((type) => IMAGE_EXT_BY_TYPE[type] === ext);
}

/** Why an uploaded file breaks the rules, or null if it's fine. */
export function imageUploadError(file: File): string | null {
  if (!IMAGE_EXT_BY_TYPE[file.type]) return "use a PNG, JPEG, GIF or WebP image";
  if (file.size > MAX_IMAGE_BYTES) {
    return `image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller`;
  }
  return null;
}

export function uploadsDir(): string {
  return path.join(dataDir, "uploads");
}

/** Stores image bytes under a fresh random name; returns the filename. */
export async function saveImage(data: Buffer, ext: string): Promise<string> {
  const filename = `${randomUUID()}${ext}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), filename), data);
  return filename;
}
