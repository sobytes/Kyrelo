import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The AI's look at each image is stubbed: these tests are about the library.
const describeImage = vi.fn(async () => "A laptop showing the Kyrelo calendar");
vi.mock("./campaign-ai", () => ({ describeImage: (...args: unknown[]) => describeImage(...(args as [])) }));

let lib: typeof import("./media-library");
let storage: typeof import("./storage");

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-media-"));
  storage = await import("./storage");
  lib = await import("./media-library");
});

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const mp4 = Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 2, 0]);

describe("media library", () => {
  it("adds images with the AI's description, and videos without one", async () => {
    const launch = await lib.createBucket("  Launch   campaign ");
    expect(launch.name).toBe("Launch campaign");
    await expect(lib.createBucket("launch campaign")).rejects.toThrow(/already/);

    const image = await lib.addMediaItem(png, { bucketId: launch.id });
    expect(image).toMatchObject({ kind: "image", description: "A laptop showing the Kyrelo calendar", bucketIds: [launch.id], bytes: png.length });
    const video = await lib.addMediaItem(mp4, { description: "Demo walkthrough", bucketId: "nope" });
    expect(video).toMatchObject({ kind: "video", description: "Demo walkthrough", bucketIds: [] });
    expect(describeImage).toHaveBeenCalledTimes(1);
  });

  it("puts an item in several buckets, ignoring ones that don't exist", async () => {
    const evergreen = await lib.createBucket("Evergreen");
    const [launch] = await storage.listMediaBuckets();
    const image = (await storage.listMediaItems())[0];
    const updated = await lib.updateMediaItem(image.id, { bucketIds: [launch.id, evergreen.id, "gone", launch.id] });
    expect(updated?.bucketIds).toEqual([launch.id, evergreen.id]);
  });

  it("deleting a bucket keeps its media, out of that bucket", async () => {
    const [launch, evergreen] = await storage.listMediaBuckets();
    await lib.deleteBucket(launch.id);
    expect((await storage.listMediaBuckets()).map((b) => b.name)).toEqual(["Evergreen"]);
    const items = await storage.listMediaItems();
    expect(items).toHaveLength(2);
    expect(items[0].bucketIds).toEqual([evergreen.id]);
  });

  it("gives a campaign one bucket's media, describing images that have no description first", async () => {
    const [evergreen] = await storage.listMediaBuckets();
    const blank = await lib.addMediaItem(png, { description: "", bucketId: evergreen.id });
    await storage.modifyMediaItems((all) => all.map((m) => (m.id === blank.id ? { ...m, description: "" } : m)));
    describeImage.mockResolvedValueOnce("A phone with the Comments screen");

    const forBucket = await lib.mediaForCampaign(evergreen.id);
    expect(forBucket.map((m) => m.description).sort()).toEqual(["A laptop showing the Kyrelo calendar", "A phone with the Comments screen"]);
    expect((await storage.listMediaItems()).find((m) => m.id === blank.id)?.description).toBe("A phone with the Comments screen");
    expect(await lib.mediaForCampaign()).toHaveLength(3);
  });
});
