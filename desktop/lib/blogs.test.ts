import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postToDevTo } from "./devto";
import { normalizeHost, postToHashnode, verifyHashnode } from "./hashnode";
import { postToSlack, slackWebhookId } from "./slack";
import { normalizeSite, postToWordPress } from "./wordpress";

// Slack, DEV, Hashnode and WordPress: the platforms where a post is a message or an article.

afterEach(() => vi.unstubAllGlobals());

function record(reply: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return reply(url, init);
    }),
  );
  return calls;
}

describe("Slack", () => {
  it("recognises webhook URLs and surfaces Slack's reason for a failure", async () => {
    expect(slackWebhookId("https://hooks.slack.com/services/T0001/B0002/abcDEF123")).toBe("B0002");
    expect(slackWebhookId("https://example.com/services/T0001/B0002/abc")).toBeNull();
    record(() => new Response("channel_not_found", { status: 404 }));
    await expect(postToSlack("https://hooks.slack.com/services/T1/B2/x", "hi")).rejects.toThrow("Slack: channel_not_found");
  });
});

describe("DEV", () => {
  it("publishes the first line as the title and the rest as Markdown", async () => {
    const calls = record(() => Response.json({ url: "https://dev.to/me/hello-1" }));
    expect(await postToDevTo("key", "Hello\n\n**Body**")).toEqual({ url: "https://dev.to/me/hello-1" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ article: { title: "Hello", body_markdown: "**Body**", published: true } });
    expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe("key");
  });
});

describe("Hashnode", () => {
  it("finds the blog by its address and publishes to it", async () => {
    expect(normalizeHost("https://Blog.Example.com/posts")).toBe("blog.example.com");
    record(() => Response.json({ data: { me: { username: "me" }, publication: null } }));
    await expect(verifyHashnode("tok", "nope.hashnode.dev")).rejects.toThrow(/no blog at nope.hashnode.dev/);

    const calls = record(() => Response.json({ data: { publishPost: { post: { url: "https://me.hashnode.dev/hello" } } } }));
    expect(await postToHashnode("tok", "pub1", "Hello\nBody")).toEqual({ url: "https://me.hashnode.dev/hello" });
    expect(JSON.parse(String(calls[0].init.body)).variables).toEqual({ input: { title: "Hello", contentMarkdown: "Body", publicationId: "pub1" } });
  });
});

describe("WordPress", () => {
  it("reads the site however it's typed", () => {
    expect(normalizeSite("example.com/blog/")).toBe("https://example.com/blog");
    expect(normalizeSite("http://localhost:8080")).toBe("http://localhost:8080");
    expect(normalizeSite("  ")).toBeNull();
  });

  it("uploads the image as the featured image, then publishes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-wp-"));
    const image = path.join(dir, "0123456789ab.jpg");
    await writeFile(image, Buffer.alloc(10));
    const calls = record((url) => (url.endsWith("/media") ? Response.json({ id: 42 }) : Response.json({ link: "https://example.com/hello" })));
    const login = { site: "https://example.com", username: "me", appPassword: "abcd efgh" };
    expect(await postToWordPress(login, "Hello\nBody text", image)).toEqual({ url: "https://example.com/hello" });
    expect(calls.map((c) => c.url)).toEqual(["https://example.com/wp-json/wp/v2/media", "https://example.com/wp-json/wp/v2/posts"]);
    // Application passwords are shown with spaces; WordPress wants them without.
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("me:abcdefgh").toString("base64")}`);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ title: "Hello", content: "Body text", status: "publish", featured_media: 42 });
  });
});
