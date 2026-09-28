import path from "node:path";
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

export function uploadsDir(): string {
  return path.join(dataDir, "uploads");
}
