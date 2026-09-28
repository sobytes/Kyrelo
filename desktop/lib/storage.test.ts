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
