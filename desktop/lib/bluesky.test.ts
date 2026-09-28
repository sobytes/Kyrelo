import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkFacets, postToBluesky } from "./bluesky";

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
