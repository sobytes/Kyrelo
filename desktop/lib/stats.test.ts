import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let stats: typeof import("./stats");
let storage: typeof import("./storage");

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-stats-"));
  storage = await import("./storage");
  stats = await import("./stats");
  const { saveAccount } = await import("./browser-connect");
  await saveAccount({ platform: "bluesky", id: "me.bsky.social", handle: "me.bsky.social", addedAt: "2026-10-04T00:00:00Z" });
  await saveAccount({ platform: "lemmy", id: "me@lemmy.world/5", handle: "me", addedAt: "2026-10-04T00:00:00Z" });
});

afterEach(() => vi.unstubAllGlobals());

function sent(id: string, platform: "bluesky" | "lemmy" | "telegram", accountId: string, postedUrl: string) {
  const at = new Date(Date.now() - 60 * 60_000).toISOString();
  return { id, platform, accountId, text: "hi", scheduledFor: at, createdAt: at, postedAt: at, status: "posted" as const, postedUrl };
}

describe("post stats", () => {
  it("reads Bluesky and Lemmy numbers for sent posts, skips platforms without stats, then waits an hour", async () => {
    await storage.insertScheduledPost(sent("b1", "bluesky", "me.bsky.social", "https://bsky.app/profile/me.bsky.social/post/3abc"));
    await storage.insertScheduledPost(sent("l1", "lemmy", "me@lemmy.world/5", "https://lemmy.world/post/77"));
    await storage.insertScheduledPost(sent("t1", "telegram", "news", "https://t.me/news/5"));
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        if (url.includes("resolveHandle")) return Response.json({ did: "did:plc:me" });
        if (url.includes("getPosts")) return Response.json({ posts: [{ likeCount: 5, repostCount: 2, quoteCount: 1, replyCount: 3 }] });
        return Response.json({ post_view: { counts: { score: 9, comments: 4 } } });
      }),
    );
    expect(await stats.refreshStats()).toEqual({ updated: 2 });
    const posts = await storage.listScheduledPosts();
    expect(posts.find((p) => p.id === "b1")?.stats).toMatchObject({ likes: 5, reposts: 3, replies: 3 });
    expect(posts.find((p) => p.id === "l1")?.stats).toMatchObject({ likes: 9, replies: 4 });
    expect(posts.find((p) => p.id === "t1")?.stats).toBeUndefined();
    expect(decodeURIComponent(fetched.find((u) => u.includes("getPosts"))!)).toContain("at://did:plc:me/app.bsky.feed.post/3abc");

    // Just refreshed: nothing is due until an hour passes, unless asked.
    expect(await stats.refreshStats()).toEqual({ updated: 0 });
    expect(await stats.refreshStats({ force: true })).toEqual({ updated: 2 });
  });
});
