import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessToken, listYouTubeComments, uploadToYouTube, videoMetadata } from "./youtube";

afterEach(() => vi.unstubAllGlobals());

const app = { clientId: "id", clientSecret: "secret" };

describe("YouTube", () => {
  it("titles the video with the post's first line, within YouTube's rules", () => {
    expect(videoMetadata("\nLaunch day <3\nMore details here")).toEqual({
      title: "Launch day 3",
      description: "\nLaunch day 3\nMore details here",
    });
    expect(Array.from(videoMetadata("x".repeat(150)).title)).toHaveLength(100);
    expect(videoMetadata("   ").title).toBe("Untitled");
  });

  it("reuses an access token until it expires, and explains a revoked refresh token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: "at-1", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await accessToken(app, "rt-cache")).toBe("at-1");
    expect(await accessToken(app, "rt-cache")).toBe("at-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 })));
    await expect(accessToken(app, "rt-revoked")).rejects.toThrow(/In production/);
  });

  it("uploads in two steps: metadata, then the bytes to the URL Google returns", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-yt-"));
    const video = path.join(dir, "0123456789ab.mp4");
    await writeFile(video, Buffer.alloc(32));
    const calls: { url: string; method?: string; headers: Record<string, string>; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method, headers: init.headers as Record<string, string>, body: init.body });
        return url.includes("uploadType=resumable")
          ? new Response(null, { status: 200, headers: { location: "https://upload.example/session-1" } })
          : Response.json({ id: "vid123" });
      }),
    );
    expect(await uploadToYouTube("at", video, "My video\nAbout it")).toEqual({ url: "https://www.youtube.com/watch?v=vid123" });
    expect(calls[0].headers["X-Upload-Content-Length"]).toBe("32");
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ snippet: { title: "My video" }, status: { privacyStatus: "public" } });
    expect(calls[1]).toMatchObject({ url: "https://upload.example/session-1", method: "PUT" });
  });

  it("lists other people's comments with the video's title, leaving out the channel's own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/commentThreads")) {
          const comment = (id: string, channel: string) => ({
            snippet: {
              videoId: "v1",
              topLevelComment: {
                id,
                snippet: { textDisplay: `comment ${id}`, authorDisplayName: "@fan", authorChannelId: { value: channel }, publishedAt: "2026-10-01T10:00:00Z" },
              },
            },
          });
          return Response.json({ items: [comment("c1", "UCfan"), comment("c2", "UCme")] });
        }
        return Response.json({ items: [{ id: "v1", snippet: { title: "How we built it", description: "Details" } }] });
      }),
    );
    expect(await listYouTubeComments("at", "UCme")).toEqual([
      { id: "c1", videoId: "v1", author: "fan", text: "comment c1", postedAt: "2026-10-01T10:00:00Z", postText: "How we built it\n\nDetails" },
    ]);
  });
});

describe("YouTube descriptions", () => {
  it("are cut to 5000 bytes between characters", async () => {
    const { fitBytes, videoMetadata } = await import("./youtube");
    const cyrillic = "Привет ".repeat(600); // 2 bytes a letter: about 7800 bytes
    expect(Buffer.byteLength(videoMetadata(cyrillic).description)).toBeLessThanOrEqual(5000);
    expect(fitBytes("ab🎉", 5)).toBe("ab");
    expect(fitBytes("short", 5000)).toBe("short");
  });
});
