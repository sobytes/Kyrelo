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

describe("reply drafts", () => {
  it("stores the AI's draft on the tweet", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { vi } = await import("vitest");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 77, reason: "angle", replies: ["hi"] }) } }] }),
          { status: 200 },
        ),
      ),
    );
    await storage.saveGrokSettings({ ...(await storage.getGrokSettings()), aiProvider: "openai" });
    await storage.modifyGrokState(() => ({
      bootstrapped: true,
      tweets: [{ id: "d1", handle: "a", text: "t", url: "https://x.com/a/status/9", isReply: false, seenAt: "2026-01-01" }],
    }));
    const { draftForTweet } = await import("./grok-watcher");
    const r = await draftForTweet("d1", 0);
    // The default style is "Ask @grok", so the draft is tagged.
    expect(r.draft?.options).toEqual(["@grok hi"]);
    const saved = (await storage.getGrokState()).tweets.find((t) => t.id === "d1");
    expect(saved?.draft).toMatchObject({ score: 77, reason: "angle", options: ["@grok hi"] });
    vi.unstubAllGlobals();
  });
});

describe("platforms Kyrelo no longer supports", () => {
  it("hides their accounts and posts, and leaves them in the files", async () => {
    const addedAt = new Date().toISOString();
    // As saved by a version that had a platform this one doesn't.
    await storage.modifyAccounts(() => [
      { platform: "twitter", id: "x-acct", handle: "x-acct", addedAt },
      { platform: "myspace" as never, id: "ms-acct", handle: "ms-acct", addedAt },
    ]);
    await storage.insertScheduledPost(post("old-myspace", { platform: "myspace" as never, accountId: "ms-acct" }));

    expect((await storage.listAccounts()).map((a) => a.id)).toEqual(["x-acct"]);
    expect((await storage.listScheduledPosts()).some((p) => p.id === "old-myspace")).toBe(false);
    // Still stored: a change to another post keeps it rather than dropping it.
    const raw = JSON.parse(
      await (await import("node:fs/promises")).readFile(path.join(process.env.STORAGE_DIR!, "scheduled-posts.json"), "utf8"),
    ) as ScheduledPost[];
    expect(raw.some((p) => p.id === "old-myspace")).toBe(true);
  });
});


describe("LinkedIn from before its API", () => {
  it("keeps Chrome-era LinkedIn accounts and posts unlisted, and lists API ones", async () => {
    const { modifyAccounts, insertScheduledPost } = storage;
    await modifyAccounts((all) => [
      ...all,
      { platform: "linkedin", id: "old-vanity", handle: "old-vanity", addedAt: "2026-09-20T10:00:00.000Z" },
      { platform: "linkedin", id: "abc123", handle: "Sam", addedAt: "2026-10-04T10:00:00.000Z" },
    ]);
    const base = { platform: "linkedin" as const, text: "hi", scheduledFor: "2030-01-01T00:00:00Z", status: "pending" as const };
    await insertScheduledPost({ ...base, id: "old-post", accountId: "old-vanity", createdAt: "2026-09-21T10:00:00.000Z" });
    await insertScheduledPost({ ...base, id: "new-post", accountId: "abc123", createdAt: "2026-10-04T10:00:00.000Z" });
    expect((await storage.listAccounts("linkedin")).map((a) => a.id)).toEqual(["abc123"]);
    expect((await storage.listScheduledPosts()).filter((p) => p.platform === "linkedin").map((p) => p.id)).toEqual(["new-post"]);
  });
});
