import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describeImage } from "./campaign-ai";
import { getGrokSettings, listMediaBuckets, listMediaItems, modifyMediaBuckets, modifyMediaItems } from "./storage";
import { MediaBucket, MediaItem } from "./types";
import { cutClip, hasFfmpeg, makePoster, probe } from "./ffmpeg";
import { imageTypeForFilename, saveImage, saveUpload, uploadsDir } from "./uploads";

// The Media library: images and videos the user keeps for posts and auto
// campaigns, grouped into named buckets (an item can be in several). Files
// live in uploads/ like any attachment, so an item's filename can go straight
// on a scheduled post. The AI describes each image from the picture itself, so
// a campaign can pick the one that fits each post; videos need the user's
// description.

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;

type ImageType = Parameters<typeof describeImage>[1];

export const isVideo = (item: Pick<MediaItem, "kind">) => item.kind === "video";

/** Has the AI describe an image from its pixels. Empty if there's no AI key or it fails. */
async function describe(filename: string): Promise<string> {
  const type = imageTypeForFilename(filename);
  if (!type) return "";
  try {
    const data = await fs.readFile(path.join(uploadsDir(), filename));
    return (await describeImage(data, type as ImageType, (await getGrokSettings()).aiProvider)).slice(0, MAX_DESCRIPTION);
  } catch (err) {
    console.warn(`[media] couldn't describe ${filename}: ${err instanceof Error ? err.message : err}`);
    return "";
  }
}

/**
 * Stores an uploaded image or video (typed by its bytes) and adds it to the
 * library, and to a bucket if given. A video can bring a poster: a still
 * frame the app made, which the AI describes when there's no description.
 */
export async function addMediaItem(
  data: Buffer,
  opts: { description?: string; bucketId?: string; poster?: Buffer } = {},
): Promise<MediaItem> {
  const filename = await saveUpload(data);
  const kind = /\.(mp4|mov)$/i.test(filename) ? "video" : "image";
  // A video's thumbnail: the app's frame, or one ffmpeg takes (any format the browser can't show).
  const videoFile = path.join(uploadsDir(), filename);
  let posterFilename = kind === "video" && opts.poster ? await saveImage(opts.poster).catch(() => undefined) : undefined;
  if (kind === "video" && !posterFilename && hasFfmpeg()) posterFilename = await makePoster(videoFile).catch(() => undefined);
  const seconds = kind === "video" && hasFfmpeg() ? await probe(videoFile).then((i) => i.seconds, () => undefined) : undefined;
  const buckets = await listMediaBuckets();
  const bucketIds = opts.bucketId && buckets.some((b) => b.id === opts.bucketId) ? [opts.bucketId] : [];
  let description = (opts.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (!description && kind === "image") description = await describe(filename);
  if (!description && posterFilename) {
    const frame = await describe(posterFilename);
    if (frame) description = `Video. A frame from it shows: ${frame}`;
  }
  const item: MediaItem = {
    id: randomUUID().slice(0, 8),
    filename,
    kind,
    bytes: data.length,
    ...(posterFilename ? { posterFilename } : {}),
    ...(seconds !== undefined ? { seconds: Math.round(seconds * 10) / 10 } : {}),
    description,
    bucketIds,
    addedAt: new Date().toISOString(),
  };
  await modifyMediaItems((items) => [...items, item]);
  return item;
}

/** Changes an item's description or buckets. Unknown bucket ids are dropped. */
export async function updateMediaItem(id: string, patch: { description?: string; bucketIds?: string[] }): Promise<MediaItem | null> {
  const known = new Set((await listMediaBuckets()).map((b) => b.id));
  let updated: MediaItem | null = null;
  await modifyMediaItems((items) =>
    items.map((m) => {
      if (m.id !== id) return m;
      updated = {
        ...m,
        ...(typeof patch.description === "string" ? { description: patch.description.trim().slice(0, MAX_DESCRIPTION) } : {}),
        ...(Array.isArray(patch.bucketIds) ? { bucketIds: [...new Set(patch.bucketIds.filter((b) => known.has(b)))] } : {}),
      };
      return updated;
    }),
  );
  return updated;
}

/** Takes the item out of the library. The file stays: scheduled posts may still use it. */
export async function removeMediaItem(id: string): Promise<void> {
  await modifyMediaItems((items) => items.filter((m) => m.id !== id));
}

function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  if (!clean) throw new Error("Give the bucket a name.");
  return clean;
}

export async function createBucket(name: string): Promise<MediaBucket> {
  const bucket: MediaBucket = { id: randomUUID().slice(0, 8), name: cleanName(name), createdAt: new Date().toISOString() };
  await modifyMediaBuckets((buckets) => {
    if (buckets.some((b) => b.name.toLowerCase() === bucket.name.toLowerCase())) {
      throw new Error(`There's already a bucket called ${bucket.name}.`);
    }
    return [...buckets, bucket];
  });
  return bucket;
}

export async function renameBucket(id: string, name: string): Promise<MediaBucket | null> {
  const clean = cleanName(name);
  let renamed: MediaBucket | null = null;
  await modifyMediaBuckets((buckets) =>
    buckets.map((b) => {
      if (b.id !== id) return b;
      renamed = { ...b, name: clean };
      return renamed;
    }),
  );
  return renamed;
}

/** Deletes the bucket; its items stay in the library (and any other buckets). */
export async function deleteBucket(id: string): Promise<void> {
  await modifyMediaBuckets((buckets) => buckets.filter((b) => b.id !== id));
  await modifyMediaItems((items) =>
    items.map((m) => (m.bucketIds?.includes(id) ? { ...m, bucketIds: m.bucketIds.filter((b) => b !== id) } : m)),
  );
}

/**
 * The items a campaign may use: one bucket's, or the whole library. Images
 * without a description get one first, so the AI picking media sees what each
 * picture shows.
 */
export async function mediaForCampaign(bucketId?: string): Promise<MediaItem[]> {
  const items = (await listMediaItems()).filter((m) => !bucketId || m.bucketIds?.includes(bucketId));
  const missing = items.filter((m) => (!isVideo(m) || m.posterFilename) && !m.description.trim());
  if (missing.length === 0) return items;
  const described = new Map<string, string>();
  for (const m of missing) {
    const frame = await describe(m.posterFilename ?? m.filename);
    const description = frame && m.posterFilename ? `Video. A frame from it shows: ${frame}` : frame;
    if (description) described.set(m.id, description);
  }
  if (described.size) {
    await modifyMediaItems((all) => all.map((m) => (described.has(m.id) ? { ...m, description: described.get(m.id)! } : m)));
  }
  return items.map((m) => (described.has(m.id) ? { ...m, description: described.get(m.id)! } : m));
}

/**
 * Cuts start–end (seconds) of a library video into a new item, kept next to
 * the original with its description and buckets.
 */
export async function clipMediaItem(id: string, start: number, end: number): Promise<MediaItem> {
  if (!hasFfmpeg()) throw new Error("Cutting clips needs ffmpeg, which comes with the Kyrelo app.");
  const source = (await listMediaItems()).find((m) => m.id === id);
  if (!source || source.kind !== "video") throw new Error("That video isn't in the library any more.");
  const filename = await cutClip(path.join(uploadsDir(), source.filename), start, end);
  const file = path.join(uploadsDir(), filename);
  const clip: MediaItem = {
    id: randomUUID().slice(0, 8),
    filename,
    kind: "video",
    bytes: (await fs.stat(file)).size,
    posterFilename: await makePoster(file).catch(() => undefined),
    seconds: Math.round((end - start) * 10) / 10,
    description: source.description,
    bucketIds: source.bucketIds ?? [],
    addedAt: new Date().toISOString(),
  };
  await modifyMediaItems((items) => [...items, clip]);
  return clip;
}
