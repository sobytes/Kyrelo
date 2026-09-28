import { mkdtemp } from "node:fs/promises";
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

function reviewCampaign(id: string): Campaign {
  const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  return {
    id,
    accountId: "acct",
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
});
