import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, chunkPlan, codeChallenge, uploadToTikTokInbox } from "./tiktok";

afterEach(() => vi.unstubAllGlobals());

const MB = 1024 * 1024;

describe("TikTok", () => {
  it("uses TikTok's hex PKCE challenge", () => {
    // SHA-256 of "abc", hex.
    expect(codeChallenge("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const url = new URL(authorizeUrl("key", "http://127.0.0.1:47770/api/accounts/oauth/callback", "st", "abc"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.upload");
  });

  it("splits big videos the way TikTok counts chunks", () => {
    expect(chunkPlan(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(chunkPlan(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
    // 105 MB: ten 10 MB chunks, the last one taking the extra 5 MB.
    expect(chunkPlan(105 * MB)).toEqual({ chunkSize: 10 * MB, count: 10 });
  });

  it("starts an inbox upload and sends the bytes with their range", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-tt-"));
    const video = path.join(dir, "0123456789ab.mp4");
    await writeFile(video, Buffer.alloc(100));
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return url.endsWith("/inbox/video/init/")
          ? Response.json({ data: { publish_id: "p1", upload_url: "https://upload.example/1" }, error: { code: "ok" } })
          : new Response(null, { status: 201 });
      }),
    );
    await uploadToTikTokInbox("at", video);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      source_info: { source: "FILE_UPLOAD", video_size: 100, chunk_size: 100, total_chunk_count: 1 },
    });
    expect((calls[1].init.headers as Record<string, string>)["Content-Range"]).toBe("bytes 0-99/100");
  });
});
