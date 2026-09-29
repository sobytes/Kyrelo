import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

// The routes use lib/storage.ts, which reads STORAGE_DIR at import time.
let posts: typeof import("./scheduler/posts/route");
let postById: typeof import("./scheduler/posts/[id]/route");
let settings: typeof import("./grok-settings/route");
let unfollow: typeof import("./unfollow/route");
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-routes-"));
  posts = await import("./scheduler/posts/route");
  postById = await import("./scheduler/posts/[id]/route");
  settings = await import("./grok-settings/route");
  unfollow = await import("./unfollow/route");
  // Posts must belong to a connected account.
  const { saveAccount } = await import("@/lib/browser-connect");
  const addedAt = new Date().toISOString();
  await saveAccount({ platform: "twitter", id: "acct", handle: "acct", addedAt });
  await saveAccount({ platform: "bluesky", id: "me.bsky.social", handle: "me.bsky.social", addedAt });
});

function json(method: string, body: unknown) {
  return new NextRequest("http://127.0.0.1:3000/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { platform: "twitter", accountId: "acct", text: "hello", scheduledFor: "2030-01-01T00:00:00Z" };

describe("scheduled post routes", () => {
  it("creates a valid post", async () => {
    expect((await posts.POST(json("POST", valid))).status).toBe(200);
  });

  it.each([
    ["whitespace-only text", { ...valid, text: "   " }],
    ["an unknown platform", { ...valid, platform: "mastodon" }],
    ["text over the limit", { ...valid, text: "x".repeat(4001) }],
    ["an invalid date", { ...valid, scheduledFor: "not a date" }],
    ["an image path outside uploads", { ...valid, imagePath: "../api-keys.json" }],
  ])("rejects %s", async (_label, body) => {
    expect((await posts.POST(json("POST", body))).status).toBe(400);
  });

  it("applies the same text and date rules when editing", async () => {
    const created = await (await posts.POST(json("POST", valid))).json();
    const ctx = { params: Promise.resolve({ id: created.post.id }) };
    expect((await postById.PATCH(json("PATCH", { text: "  " }), ctx)).status).toBe(400);
    expect((await postById.PATCH(json("PATCH", { scheduledFor: "nope" }), ctx)).status).toBe(400);
    expect((await postById.PATCH(json("PATCH", { text: "edited" }), ctx)).status).toBe(200);
  });

  it("applies each platform's own length limit", async () => {
    const bsky = { ...valid, platform: "bluesky", accountId: "me.bsky.social" };
    expect((await posts.POST(json("POST", { ...bsky, text: "x".repeat(300) }))).status).toBe(200);
    const tooLong = await posts.POST(json("POST", { ...bsky, text: "x".repeat(301) }));
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error).toMatch(/Bluesky/);
    // 301 characters is fine on X.
    expect((await posts.POST(json("POST", { ...valid, text: "x".repeat(301) }))).status).toBe(200);
  });

  it("rejects an account that isn't connected on that platform", async () => {
    // "acct" is connected on X, not Bluesky.
    expect((await posts.POST(json("POST", { ...valid, platform: "bluesky" }))).status).toBe(400);
    expect((await posts.POST(json("POST", { ...valid, accountId: "nobody" }))).status).toBe(400);
  });

  it("validates an edit against the post's platform", async () => {
    const bsky = { ...valid, platform: "bluesky", accountId: "me.bsky.social" };
    const created = await (await posts.POST(json("POST", bsky))).json();
    const ctx = { params: Promise.resolve({ id: created.post.id }) };
    expect((await postById.PATCH(json("PATCH", { text: "x".repeat(301) }), ctx)).status).toBe(400);
    expect((await postById.PATCH(json("PATCH", { accountId: "acct" }), ctx)).status).toBe(400);
  });

  it("returns 404 when editing a post that doesn't exist", async () => {
    const ctx = { params: Promise.resolve({ id: "missing" }) };
    expect((await postById.PATCH(json("PATCH", { text: "x" }), ctx)).status).toBe(404);
  });
});

describe("monitor settings route", () => {
  it("rejects a malformed body instead of crashing", async () => {
    expect((await settings.PUT(json("PUT", "{not json"))).status).toBe(400);
    expect((await settings.PUT(json("PUT", { handles: "sama" }))).status).toBe(400);
    expect((await settings.PUT(json("PUT", { aiProvider: "gemini" }))).status).toBe(400);
  });

  it("validates Autopilot settings", async () => {
    const res = await settings.PUT(
      json("PUT", { autopilot: { enabled: true, tone: "rude", style: "direct", minScore: 250, creativity: -1, extra: 1 } }),
    );
    const { autopilot } = (await res.json()).settings;
    expect(autopilot).toEqual({
      enabled: true,
      tone: "curious", // unknown tone ignored
      style: "direct",
      minScore: 100, // clamped
      creativity: 0, // clamped
      topics: "",
      avoid: "",
    });
  });

  it("saves known fields and drops unknown ones", async () => {
    const res = await settings.PUT(json("PUT", { handles: ["@Sama"], evil: true }));
    const body = await res.json();
    expect(body.settings.handles).toEqual(["sama"]);
    expect("evil" in body.settings).toBe(false);
  });
});

describe("unfollow route", () => {
  // Every refusal happens before a browser opens.
  beforeAll(async () => {
    const { modifyUnfollowData } = await import("@/lib/storage");
    await modifyUnfollowData("acct", (d) => ({
      ...d,
      following: [
        { handle: "ghost", name: "Ghost", followsYou: false, posts: 0 },
        { handle: "Pal", name: "Pal", followsYou: true, posts: 0 },
        { handle: "celeb", name: "Celeb", followsYou: false, posts: 0, followers: 2_000_000 },
      ],
      keep: ["pal"],
    }));
  });

  const unfollowReq = (handles: unknown, rules?: object) =>
    unfollow.POST(json("POST", { action: "unfollow", accountId: "acct", handles, rules }));

  it("refuses accounts that aren't in the last scan", async () => {
    const res = await unfollowReq(["stranger"]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't in your last scan/);
  });

  it("refuses kept and big accounts, whatever the page sent", async () => {
    expect((await (await unfollowReq(["pal"])).json()).error).toMatch(/protected \(on your keep list\)/);
    expect((await (await unfollowReq(["celeb"])).json()).error).toMatch(/protected \(big account\)/);
  });

  it("caps a run", async () => {
    const res = await unfollowReq(Array.from({ length: 101 }, (_, i) => `a${i}`));
    expect((await res.json()).error).toMatch(/up to 100 at a time/);
  });

  it("only follows again accounts it unfollowed", async () => {
    const res = await unfollow.POST(json("POST", { action: "refollow", accountId: "acct", handles: ["ghost"] }));
    expect((await res.json()).error).toMatch(/wasn't unfollowed here/);
  });

  it("keeps and unkeeps", async () => {
    const res = await unfollow.POST(json("POST", { action: "keep", accountId: "acct", handle: "Ghost" }));
    expect((await res.json()).data.keep).toEqual(["pal", "ghost"]);
    const undo = await unfollow.POST(json("POST", { action: "keep", accountId: "acct", handle: "ghost", keep: false }));
    expect((await undo.json()).data.keep).toEqual(["pal"]);
  });
});

