import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The AI is stubbed: these tests are about gathering, drafting and sending.
const draftCommentReplies = vi.fn();
vi.mock("./ai", () => ({
  draftCommentReplies: (...args: unknown[]) => draftCommentReplies(...args),
  aiErrorMessage: (err: unknown) => String(err),
}));

let comments: typeof import("./comments");
let storage: typeof import("./storage");

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-comments-"));
  storage = await import("./storage");
  comments = await import("./comments");
  const { saveAccount } = await import("./browser-connect");
  await saveAccount({ platform: "mastodon", id: "me@mastodon.social", handle: "me@mastodon.social", addedAt: "2026-01-01T00:00:00Z" });
  await storage.setAccountSecret("mastodon", "me@mastodon.social", { instance: "https://mastodon.social", token: "tok" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  draftCommentReplies.mockReset();
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** A Mastodon server with these replies to the user's post. */
function mockMastodon(replies: { id: string; createdAt: string }[], onPost?: (body: unknown) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return onPost ? onPost(JSON.parse(String(init.body))) : Response.json({ url: "https://mastodon.social/@me/r" });
      if (url.endsWith("/verify_credentials")) return Response.json({ id: "me", acct: "me", username: "me" });
      if (url.includes("/notifications")) {
        return Response.json(
          replies.map((r) => ({
            account: { id: "fan", acct: "fan" },
            status: {
              id: r.id,
              content: `<p>comment ${r.id}</p>`,
              url: `https://mastodon.social/@fan/${r.id}`,
              created_at: r.createdAt,
              visibility: "public",
              in_reply_to_id: "post",
              in_reply_to_account_id: "me",
            },
          })),
        );
      }
      return Response.json({ id: "post", content: "<p>my post</p>" });
    }),
  );
}

describe("comments check", () => {
  it("does nothing while background checks are off, unless asked", async () => {
    expect(await comments.runCommentsCheck()).toEqual({ skipped: "disabled" });
  });

  it("adds new comments once, skips ones already old, and drafts above the minimum score", async () => {
    await storage.saveCommentSettings({ ...(await storage.getCommentSettings()), enabled: true });
    mockMastodon([
      { id: "1", createdAt: minutesAgo(5) },
      { id: "old", createdAt: minutesAgo(3 * 24 * 60) },
    ]);
    draftCommentReplies.mockResolvedValue({ score: 80, reason: "a real question", options: ["Thanks!"] });

    expect(await comments.runCommentsCheck()).toEqual({ newComments: 1 });
    expect(await comments.runCommentsCheck()).toEqual({ newComments: 0 });

    const state = await storage.getCommentsState();
    expect(state.comments.map((c) => c.id)).toEqual(["mastodon:me@mastodon.social:1"]);
    expect(state.comments[0]).toMatchObject({ author: "fan", text: "comment 1", postText: "my post", draft: { options: ["Thanks!"] } });
    // Drafted once, not again on the second check.
    expect(draftCommentReplies).toHaveBeenCalledTimes(1);
    expect(draftCommentReplies.mock.calls[0][0]).toMatchObject({ platform: "mastodon", threshold: 30 });
  });

  it("records an account's error and keeps checking the others", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "This action is outside the authorized scopes" }, { status: 403 })));
    await comments.runCommentsCheck();
    expect((await storage.getCommentsState()).accountErrors).toEqual({
      "mastodon:me@mastodon.social": expect.stringMatching(/Reconnect/),
    });
  });
});

describe("sending a reply", () => {
  const id = "mastodon:me@mastodon.social:1";

  it("keeps the error when the platform refuses, then sends once and refuses a second reply", async () => {
    mockMastodon([], () => Response.json({ error: "Validation failed" }, { status: 422 }));
    expect(await comments.sendCommentReply(id, "thanks!")).toMatchObject({ error: "Mastodon: Validation failed" });
    expect((await storage.getCommentsState()).comments[0].replyError).toBe("Mastodon: Validation failed");

    const posted: unknown[] = [];
    mockMastodon([], (body) => {
      posted.push(body);
      return Response.json({ url: "https://mastodon.social/@me/r" });
    });
    const r = await comments.sendCommentReply(id, "  thanks!  ");
    expect(r.comment).toMatchObject({ replyText: "thanks!", replyUrl: "https://mastodon.social/@me/r", replyError: undefined });
    expect(posted).toEqual([{ status: "@fan thanks!", in_reply_to_id: "1", visibility: "public" }]);
    expect(await comments.sendCommentReply(id, "again")).toEqual({ error: "You've already replied to this comment." });
  });

  it("refuses an empty reply", async () => {
    expect(await comments.sendCommentReply(id, "   ")).toEqual({ error: "Write a reply first." });
  });
});
