import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Campaign } from "./types";

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
let storage: typeof import("./storage");
let campaign: typeof import("./campaign");
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-campaign-"));
  storage = await import("./storage");
  campaign = await import("./campaign");
});

function reviewCampaign(id: string, targets: Campaign["targets"] = [{ platform: "twitter", accountId: "acct" }]): Campaign {
  const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  return {
    id,
    targets,
    accountId: targets[0].accountId,
    maxLength: 280,
    brief: "b",
    url: "https://example.com",
    competitors: "",
    count: 2,
    windowMinutes: 60,
    useAiImages: false,
    autoSchedule: false,
    provider: "claude",
    status: "review",
    progress: "",
    drafts: [
      { id: "d1", angle: "tip", text: "first", media: { kind: "none" }, sources: [], scheduledFor: later(10) },
      { id: "d2", angle: "question", text: "second", media: { kind: "none" }, sources: [], scheduledFor: later(30) },
    ],
    postIds: [],
    createdAt: new Date().toISOString(),
  };
}

describe("scheduleCampaign", () => {
  it("creates each post once when scheduled twice at the same moment", async () => {
    await storage.upsertCampaign(reviewCampaign("c1"));
    const results = await Promise.allSettled([
      campaign.scheduleCampaign("c1"),
      campaign.scheduleCampaign("c1"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const posts = (await storage.listScheduledPosts()).filter((p) => p.campaignId === "c1");
    expect(posts.map((p) => p.text).sort()).toEqual(["first", "second"]);
  });

  it("refuses a campaign that is already scheduled", async () => {
    await expect(campaign.scheduleCampaign("c1")).rejects.toThrow(/already scheduled/);
  });

  it("can discard a campaign waiting for review, but not a scheduled one", async () => {
    await storage.upsertCampaign(reviewCampaign("c2"));
    await campaign.discardCampaign("c2");
    expect((await storage.getCampaign("c2"))?.status).toBe("discarded");
    await expect(campaign.discardCampaign("c1")).rejects.toThrow();
  });

  it("posts to every target, with the image only where the platform takes it", async () => {
    const { uploadsDir } = await import("./uploads");
    await mkdir(uploadsDir(), { recursive: true });
    const big = "aaaaaaaa-0000-4000-8000-000000000001.png";
    await writeFile(path.join(uploadsDir(), big), Buffer.alloc(2_000_000)); // over Bluesky's 1 MB
    const c = reviewCampaign("multi", [
      { platform: "twitter", accountId: "x1" },
      { platform: "bluesky", accountId: "me.bsky.social" },
      { platform: "threads", accountId: "me" },
    ]);
    c.drafts = [{ ...c.drafts[0], media: { kind: "library", imagePath: big } }];
    await storage.upsertCampaign(c);

    const done = await campaign.scheduleCampaign("multi");
    expect(done.postIds).toHaveLength(3);
    const posts = (await storage.listScheduledPosts()).filter((p) => p.campaignId === "multi");
    expect(posts.map((p) => [p.platform, p.imagePath ?? null])).toEqual([
      ["twitter", big],
      ["bluesky", null],
      ["threads", null],
    ]);
  });

  it("sends Instagram only the posts with a photo it takes", async () => {
    const { uploadsDir } = await import("./uploads");
    await mkdir(uploadsDir(), { recursive: true });
    const photo = "aaaaaaaa-0000-4000-8000-000000000002.png";
    await writeFile(path.join(uploadsDir(), photo), Buffer.alloc(1000));
    const c = reviewCampaign("insta", [
      { platform: "twitter", accountId: "x1" },
      { platform: "instagram", accountId: "me" },
    ]);
    c.drafts = [{ ...c.drafts[0], media: { kind: "library", imagePath: photo } }, c.drafts[1]];
    await storage.upsertCampaign(c);

    const done = await campaign.scheduleCampaign("insta");
    const posts = (await storage.listScheduledPosts()).filter((p) => p.campaignId === "insta");
    expect(posts.map((p) => [p.platform, p.text, p.imagePath ?? null])).toEqual([
      ["twitter", "first", photo],
      ["instagram", "first", photo],
      ["twitter", "second", null],
    ]);
    expect(done.postIds).toHaveLength(3);
  });

  it("sends a library video only to the accounts that can post one; Instagram skips it", async () => {
    const { uploadsDir } = await import("./uploads");
    await mkdir(uploadsDir(), { recursive: true });
    const video = "aaaaaaaa-0000-4000-8000-000000000003.mp4";
    await writeFile(path.join(uploadsDir(), video), Buffer.alloc(2_000_000));
    const c = reviewCampaign("video", [
      { platform: "mastodon", accountId: "me@m.social" },
      { platform: "threads", accountId: "me" },
      { platform: "instagram", accountId: "me" },
    ]);
    c.drafts = [{ ...c.drafts[0], media: { kind: "library", videoPath: video } }];
    await storage.upsertCampaign(c);

    await campaign.scheduleCampaign("video");
    const posts = (await storage.listScheduledPosts()).filter((p) => p.campaignId === "video");
    expect(posts.map((p) => [p.platform, p.videoPath ?? null, p.imagePath ?? null])).toEqual([
      ["mastodon", video, null],
      ["threads", null, null],
    ]);
  });

  it("refuses an edit too long for one of the platforms", async () => {
    const c = reviewCampaign("strict", [
      { platform: "mastodon", accountId: "me@mastodon.social" },
      { platform: "bluesky", accountId: "me.bsky.social" },
    ]);
    await storage.upsertCampaign(c);
    const edit = (text: string) => [{ id: "d1", text, scheduledFor: c.drafts[0].scheduledFor, removeImage: false }];
    // Fine for Mastodon (500), too long for Bluesky (300).
    await expect(campaign.scheduleCampaign("strict", edit("x".repeat(400)))).rejects.toThrow(/too long/);
    await expect(campaign.scheduleCampaign("strict", edit("x".repeat(290)))).resolves.toHaveProperty("status", "scheduled");
  });

  it("reads a campaign saved before targets as one X account", async () => {
    const legacy = { ...reviewCampaign("old"), targets: undefined, maxLength: undefined } as unknown as Campaign;
    await storage.upsertCampaign(legacy);
    expect(await storage.getCampaign("old")).toMatchObject({ targets: [{ platform: "twitter", accountId: "acct" }], maxLength: 280 });
  });
});


describe("postHistory", () => {
  it("lists the accounts' earlier posts and campaign drafts, newest first, each once", async () => {
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const base = { platform: "twitter" as const, status: "posted" as const, createdAt: at(500) };
    await storage.insertScheduledPost({ ...base, id: "h1", accountId: "hist", text: "Older post", scheduledFor: at(300) });
    await storage.insertScheduledPost({ ...base, id: "h2", accountId: "hist", text: "Newer post", scheduledFor: at(100) });
    await storage.insertScheduledPost({ ...base, id: "h3", accountId: "someone-else", text: "Not this account", scheduledFor: at(50) });
    const prev = reviewCampaign("prev-hist", [{ platform: "twitter", accountId: "hist" }]);
    prev.drafts = [{ ...prev.drafts[0], text: "Newer post", scheduledFor: at(100) }, { ...prev.drafts[1], text: "A draft never sent", scheduledFor: at(200) }];
    await storage.upsertCampaign(prev);
    const history = await campaign.postHistory({ id: "new", targets: [{ platform: "twitter", accountId: "hist" }] });
    expect(history).toEqual(["Newer post", "A draft never sent", "Older post"]);
  });
});
