import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkFacets, listBlueskyComments, postToBluesky, replyOnBluesky } from "./bluesky";

describe("linkFacets", () => {
  it("marks links by UTF-8 byte offset, not character offset", () => {
    const text = "café 🦋 https://kyrelo.com rocks";
    const [facet] = linkFacets(text);
    const bytes = Buffer.from(text);
    expect(bytes.subarray(facet.index.byteStart, facet.index.byteEnd).toString()).toBe("https://kyrelo.com");
    expect(facet.features[0].uri).toBe("https://kyrelo.com");
  });

  it("doesn't swallow trailing punctuation", () => {
    expect(linkFacets("see https://kyrelo.com.")[0].features[0].uri).toBe("https://kyrelo.com");
  });

  it("returns nothing for text without links", () => {
    expect(linkFacets("no links here")).toEqual([]);
  });
});

describe("postToBluesky", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockBluesky() {
    const calls: { method: string; body: unknown; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const method = url.split("/xrpc/")[1];
        const headers = init.headers as Record<string, string>;
        const body = headers["Content-Type"] === "application/json" ? JSON.parse(String(init.body)) : init.body;
        calls.push({ method, body, headers });
        const reply: Record<string, object> = {
          "com.atproto.server.createSession": { did: "did:plc:abc", handle: "me.bsky.social", accessJwt: "jwt" },
          "com.atproto.repo.uploadBlob": { blob: { ref: "blob-ref" } },
          "com.atproto.repo.createRecord": { uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz" },
        };
        return new Response(JSON.stringify(reply[method]), { status: 200 });
      }),
    );
    return calls;
  }

  it("signs in, posts with clickable links, and returns the post URL", async () => {
    const calls = mockBluesky();
    const { url } = await postToBluesky("@me.bsky.social", "app-pass", "hello https://kyrelo.com");
    expect(url).toBe("https://bsky.app/profile/me.bsky.social/post/3kxyz");
    expect(calls.map((c) => c.method)).toEqual(["com.atproto.server.createSession", "com.atproto.repo.createRecord"]);
    expect(calls[0].body).toEqual({ identifier: "me.bsky.social", password: "app-pass" });
    const record = (calls[1].body as { repo: string; record: { text: string; facets: unknown[] } });
    expect(record.repo).toBe("did:plc:abc");
    expect(record.record.text).toBe("hello https://kyrelo.com");
    expect(record.record.facets).toHaveLength(1);
    expect(calls[1].headers.Authorization).toBe("Bearer jwt");
  });

  it("uploads an attached image and embeds it", async () => {
    const calls = mockBluesky();
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-bsky-"));
    const image = path.join(dir, "0123456789ab.png");
    await writeFile(image, Buffer.alloc(100));
    await postToBluesky("me.bsky.social", "p", "pic", image);
    expect(calls[1].method).toBe("com.atproto.repo.uploadBlob");
    expect(calls[1].headers["Content-Type"]).toBe("image/png");
    const embed = (calls[2].body as { record: { embed: { images: { image: unknown }[] } } }).record.embed;
    expect(embed.images[0].image).toEqual({ ref: "blob-ref" });
  });

  it("refuses images over Bluesky's 1 MB limit before uploading", async () => {
    const calls = mockBluesky();
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-bsky-"));
    const image = path.join(dir, "0123456789ab.jpg");
    await writeFile(image, Buffer.alloc(1_000_001));
    await expect(postToBluesky("me.bsky.social", "p", "pic", image)).rejects.toThrow(/1 MB/);
    expect(calls.some((c) => c.method === "com.atproto.repo.uploadBlob")).toBe(false);
  });

  it("surfaces Bluesky's reason when sign-in is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "AuthenticationRequired", message: "Invalid identifier or password" }), { status: 401 })),
    );
    await expect(postToBluesky("me", "wrong", "hi")).rejects.toThrow(/Invalid identifier or password/);
  });
});

describe("Bluesky comments", () => {
  afterEach(() => vi.unstubAllGlobals());

  const root = { uri: "at://did:plc:me/app.bsky.feed.post/root", cid: "root-cid" };
  const reply = (did: string, handle: string, rkey: string, parent: string) => ({
    uri: `at://${did}/app.bsky.feed.post/${rkey}`,
    cid: `cid-${rkey}`,
    author: { did, handle },
    reason: "reply",
    reasonSubject: parent,
    record: { text: `comment ${rkey}`, createdAt: "2026-10-01T10:00:00Z", reply: { root, parent: { uri: parent, cid: "p" } } },
    indexedAt: "2026-10-01T10:00:01Z",
  });

  function mockBluesky(opts: { expireOnce?: boolean } = {}) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    let expired = opts.expireOnce ?? false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = url.split("/xrpc/")[1].split("?")[0];
        calls.push({ method, url, body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined });
        if (method === "com.atproto.server.createSession") {
          return Response.json({ did: "did:plc:me", handle: "me.bsky.social", accessJwt: `jwt-${calls.length}` });
        }
        if (expired) {
          expired = false;
          return Response.json({ error: "ExpiredToken", message: "Token has expired" }, { status: 400 });
        }
        if (method === "app.bsky.notification.listNotifications") {
          return Response.json({
            notifications: [
              reply("did:plc:fan", "fan.bsky.social", "c1", root.uri),
              reply("did:plc:me", "me.bsky.social", "mine", root.uri),
              { ...reply("did:plc:x", "x.bsky.social", "like", root.uri), reason: "like" },
            ],
          });
        }
        if (method === "app.bsky.feed.getPosts") return Response.json({ posts: [{ uri: root.uri, record: { text: "my post" } }] });
        return Response.json({ uri: "at://did:plc:me/app.bsky.feed.post/r1" });
      }),
    );
    return calls;
  }

  it("lists other people's replies to your posts, with your post's text", async () => {
    mockBluesky();
    const comments = await listBlueskyComments("list-test.bsky.social", "pw");
    expect(comments).toEqual([
      {
        uri: "at://did:plc:fan/app.bsky.feed.post/c1",
        cid: "cid-c1",
        root,
        author: "fan.bsky.social",
        text: "comment c1",
        url: "https://bsky.app/profile/fan.bsky.social/post/c1",
        postedAt: "2026-10-01T10:00:00Z",
        postText: "my post",
      },
    ]);
  });

  it("keeps the session between calls and signs in again when it expires", async () => {
    const calls = mockBluesky();
    await listBlueskyComments("session-test.bsky.social", "pw");
    await listBlueskyComments("session-test.bsky.social", "pw");
    expect(calls.filter((c) => c.method === "com.atproto.server.createSession")).toHaveLength(1);

    const again = mockBluesky({ expireOnce: true });
    await listBlueskyComments("session-test.bsky.social", "pw");
    expect(again.map((c) => c.method)).toEqual([
      "app.bsky.notification.listNotifications",
      "com.atproto.server.createSession",
      "app.bsky.notification.listNotifications",
      "app.bsky.feed.getPosts",
    ]);
  });

  it("replies in the comment's thread", async () => {
    const calls = mockBluesky();
    const comment = { uri: "at://did:plc:fan/app.bsky.feed.post/c1", cid: "cid-c1", root };
    const { url } = await replyOnBluesky("reply-test.bsky.social", "pw", comment, "thanks!");
    expect(url).toBe("https://bsky.app/profile/me.bsky.social/post/r1");
    const record = (calls.at(-1)!.body as { record: { text: string; reply: unknown } }).record;
    expect(record.text).toBe("thanks!");
    expect(record.reply).toEqual({ root, parent: { uri: comment.uri, cid: comment.cid } });
  });
});
