import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The routes use lib/storage.ts, which reads STORAGE_DIR at import time.
let posts: typeof import("./scheduler/posts/route");
let postById: typeof import("./scheduler/posts/[id]/route");
let settings: typeof import("./grok-settings/route");
let unfollow: typeof import("./unfollow/route");
let finder: typeof import("./handle-finder/route");
let deleter: typeof import("./deleter/route");
beforeAll(async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "kyrelo-routes-"));
  posts = await import("./scheduler/posts/route");
  postById = await import("./scheduler/posts/[id]/route");
  settings = await import("./grok-settings/route");
  unfollow = await import("./unfollow/route");
  finder = await import("./handle-finder/route");
  deleter = await import("./deleter/route");
  // Posts must belong to a connected account.
  const { saveAccount } = await import("@/lib/browser-connect");
  const addedAt = new Date().toISOString();
  await saveAccount({ platform: "twitter", id: "acct", handle: "acct", addedAt });
  await saveAccount({ platform: "bluesky", id: "me.bsky.social", handle: "me.bsky.social", addedAt });
  await saveAccount({ platform: "instagram", id: "me.insta", handle: "me.insta", addedAt });
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
    ["an unknown platform", { ...valid, platform: "myspace" }],
    ["text over the limit", { ...valid, text: "x".repeat(4001) }],
    ["an invalid date", { ...valid, scheduledFor: "not a date" }],
    ["an image path outside uploads", { ...valid, imagePath: "../api-keys.json" }],
  ])("rejects %s", async (_label, body) => {
    expect((await posts.POST(json("POST", body))).status).toBe(400);
  });

  it("needs a JPEG or PNG photo for Instagram, including when editing", async () => {
    const insta = { ...valid, platform: "instagram", accountId: "me.insta" };
    expect(await (await posts.POST(json("POST", insta))).json()).toEqual({ error: "Instagram posts need a photo" });
    expect((await posts.POST(json("POST", { ...insta, imagePath: "abcdef.webp" }))).status).toBe(400);
    const created = await (await posts.POST(json("POST", { ...insta, imagePath: "abcdef.jpg" }))).json();
    const ctx = { params: Promise.resolve({ id: created.post.id }) };
    expect((await postById.PATCH(json("PATCH", { imagePath: null }), ctx)).status).toBe(400);
    expect((await postById.PATCH(json("PATCH", { text: "new caption" }), ctx)).status).toBe(200);
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

  it("gives the phone each account's reasons for the rules it sends", async () => {
    const url = `http://127.0.0.1:3000/api/unfollow?accountId=acct&rules=${encodeURIComponent(JSON.stringify({ notFollowingBack: true }))}`;
    const body = await (await unfollow.GET(new NextRequest(url))).json();
    expect(body.rules.notFollowingBack).toBe(true);
    const byHandle = Object.fromEntries(body.rows.map((r: { handle: string }) => [r.handle, r]));
    expect(byHandle.ghost.reasons).toContain("doesn't follow you");
    expect(byHandle.Pal.protectedBecause).toBe("on your keep list");
    expect(byHandle.celeb.protectedBecause).toBe("big account");
  });

  it("keeps and unkeeps", async () => {
    const res = await unfollow.POST(json("POST", { action: "keep", accountId: "acct", handle: "Ghost" }));
    expect((await res.json()).data.keep).toEqual(["pal", "ghost"]);
    const undo = await unfollow.POST(json("POST", { action: "keep", accountId: "acct", handle: "ghost", keep: false }));
    expect((await undo.json()).data.keep).toEqual(["pal"]);
  });
});

describe("handle finder route", () => {
  beforeAll(async () => {
    const { modifyHandleFinderData } = await import("@/lib/storage");
    await modifyHandleFinderData("acct", (d) => ({
      ...d,
      suggestions: [
        { handle: "Fresh", name: "Fresh", group: "audience", reason: "", fromX: false, youFollow: false },
        { handle: "friend", name: "Friend", group: "peer", reason: "", fromX: false, youFollow: true },
      ],
    }));
  });

  const followReq = (handles: unknown) => finder.POST(json("POST", { action: "follow", accountId: "acct", handles }));

  it("only follows accounts it suggested", async () => {
    expect((await (await followReq(["stranger"])).json()).error).toMatch(/isn't in the finder's suggestions/);
  });

  it("skips accounts already followed", async () => {
    expect((await (await followReq(["friend"])).json()).error).toMatch(/already follow all of them/);
  });

  it("caps a run", async () => {
    const res = await followReq(Array.from({ length: 51 }, (_, i) => `a${i}`));
    expect((await res.json()).error).toMatch(/up to 50 at a time/);
  });

  describe("without an AI key", () => {
    // A key in the environment counts too (lib/ai.ts); without this a real run would start.
    const env = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
    beforeAll(() => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });
    afterAll(() => {
      if (env.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = env.anthropic;
      if (env.openai !== undefined) process.env.OPENAI_API_KEY = env.openai;
    });
    const find = (body: object) => finder.POST(json("POST", { action: "find", accountId: "acct", ...body }));

    it("needs an AI key and a valid link to research", async () => {
      expect((await (await find({ brief: "Invoices for plumbers" })).json()).error).toMatch(/API key in Settings/);
      expect((await (await find({ url: "javascript:alert(1)" })).json()).error).toMatch(/must start with http/);
    });

    it("saves the brand profile it's sent, and keeps it when a request sends none", async () => {
      const { getBrandProfile } = await import("@/lib/storage");
      const saved = { brief: "Invoices for plumbers", url: "https://example.com", competitors: "" };
      await find(saved);
      expect(await getBrandProfile()).toEqual(saved);
      await find({});
      expect(await getBrandProfile()).toEqual(saved);
    });
  });
});

describe("deleter route", () => {
  // Refused before a browser opens.
  it("only deletes posts, replies or likes", async () => {
    const res = await deleter.POST(json("POST", { accountId: "acct", target: "dms", count: 5, startingAt: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/posts, replies or likes/);
  });
});

describe("campaigns route", () => {
  // Refused before any research starts.
  const start = (body: object) =>
    import("./campaigns/route").then((r) => r.POST(json("POST", { brief: "b", count: 2, windowMinutes: 60, ...body })));

  it("needs at least one connected account to post to", async () => {
    expect((await (await start({ targets: [] })).json()).error).toMatch(/at least one connected account/);
    const stranger = await start({ targets: [{ platform: "mastodon", accountId: "nobody@example.social" }] });
    expect(stranger.status).toBe(400);
  });
});


describe("phone account connect route", () => {
  const phone = () => import("./accounts/phone/route");

  it("adds only: no disconnecting, and X isn't connected this way", async () => {
    const { POST } = await phone();
    expect((await POST(json("POST", { action: "disconnect", platform: "bluesky", accountId: "a" }))).status).toBe(400);
    expect(await (await POST(json("POST", { action: "connect", platform: "twitter", fields: {} }))).json()).toEqual({
      error: "X doesn't connect this way.",
    });
  });

  it("sends Mastodon's approval back to the phone app", async () => {
    const { POST } = await phone();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ client_id: "cid", client_secret: "cs" })) as typeof fetch;
    try {
      const res = await (await POST(json("POST", { action: "mastodon-start", server: "mastodon.social" }))).json();
      expect(new URL(res.authorizeUrl).searchParams.get("redirect_uri")).toBe("kyrelo://mastodon");
    } finally {
      globalThis.fetch = realFetch;
    }
    const finish = await POST(json("POST", { action: "mastodon-finish", state: "forged", code: "c" }));
    expect((await finish.json()).error).toMatch(/expired/);
  });
});

describe("videos on scheduled posts", () => {
  it("takes an uploaded video where the platform can post one, and refuses image + video or a missing file", async () => {
    const { saveUpload } = await import("@/lib/uploads");
    const { saveAccount } = await import("@/lib/browser-connect");
    await saveAccount({ platform: "mastodon", id: "me@m.social", handle: "me@m.social", addedAt: new Date().toISOString() });
    const video = await saveUpload(Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 2, 0]));
    const toot = { ...valid, platform: "mastodon", accountId: "me@m.social" };
    const created = await (await posts.POST(json("POST", { ...toot, videoPath: video }))).json();
    expect(created.post.videoPath).toBe(video);
    // Instagram posts through its site with photos only.
    const insta = { ...valid, platform: "instagram", accountId: "me.insta" };
    expect(await (await posts.POST(json("POST", { ...insta, videoPath: video }))).json()).toEqual({
      error: "Kyrelo can't post videos to Instagram yet",
    });
    expect((await posts.POST(json("POST", { ...toot, videoPath: video, imagePath: "abcdef.png" }))).status).toBe(400);
    expect(await (await posts.POST(json("POST", { ...toot, videoPath: "0123456789ab.mp4" }))).json()).toEqual({
      error: "that video isn't uploaded any more",
    });
  });
});
