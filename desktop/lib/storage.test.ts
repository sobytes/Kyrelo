import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ScheduledPost } from "./types";

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
let storage: typeof import("./storage");
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-storage-"));
  storage = await import("./storage");
});

function post(id: string, patch: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id,
    platform: "twitter",
    accountId: "acct",
    text: `post ${id}`,
    scheduledFor: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: "pending",
    ...patch,
  };
}

describe("scheduled post storage", () => {
  it("keeps every change when writes overlap", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => storage.insertScheduledPost(post(`p${i}`))),
    );
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        storage.updateScheduledPost(`p${i}`, (p) => ({ ...p, text: `edited ${i}` })),
      ),
    );
    const all = await storage.listScheduledPosts();
    expect(all).toHaveLength(20);
    expect(all.every((p) => p.text.startsWith("edited"))).toBe(true);
  });

  it("does not bring back a post that was cancelled mid-send", async () => {
    await storage.insertScheduledPost(post("gone", { status: "posting" }));
    await storage.deleteScheduledPost("gone");
    const result = await storage.updateScheduledPost("gone", (p) => ({ ...p, status: "posted" }));
    expect(result).toBeNull();
    expect((await storage.listScheduledPosts()).some((p) => p.id === "gone")).toBe(false);
  });

  it("leaves the post untouched when the change declines", async () => {
    await storage.insertScheduledPost(post("sending", { status: "posting", text: "original" }));
    const result = await storage.updateScheduledPost("sending", (p) =>
      p.status === "pending" ? { ...p, text: "late edit" } : null,
    );
    expect(result).toBeNull();
    const stored = (await storage.listScheduledPosts()).find((p) => p.id === "sending");
    expect(stored?.status).toBe("posting");
    expect(stored?.text).toBe("original");
  });
});

describe("watcher state storage", () => {
  it("keeps a reply marked while another change is being saved", async () => {
    await storage.modifyGrokState(() => ({
      bootstrapped: true,
      tweets: [
        { id: "t1", handle: "a", text: "x", url: "https://x.com/a/status/1", isReply: false, seenAt: "2026-01-01" },
      ],
    }));
    // A scrape merge and a "mark replied" land at the same time.
    await Promise.all([
      storage.modifyGrokState((s) => ({
        ...s,
        tweets: [
          ...s.tweets,
          { id: "t2", handle: "a", text: "y", url: "https://x.com/a/status/2", isReply: false, seenAt: "2026-01-02" },
        ],
      })),
      storage.modifyGrokState((s) => ({
        ...s,
        tweets: s.tweets.map((t) => (t.id === "t1" ? { ...t, repliedAt: "now" } : t)),
      })),
    ]);
    const state = await storage.getGrokState();
    expect(state.tweets.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(state.tweets.find((t) => t.id === "t1")?.repliedAt).toBe("now");
  });
});
