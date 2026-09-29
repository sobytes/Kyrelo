import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeInstance, postToMastodon } from "./mastodon";

afterEach(() => vi.unstubAllGlobals());

describe("Mastodon", () => {
  it("reads the server however the user types it", () => {
    for (const input of ["mastodon.social", "https://mastodon.social/", "Mastodon.Social", "@me@mastodon.social", "mastodon.social/@me"]) {
      expect(normalizeInstance(input)).toBe("https://mastodon.social");
    }
    expect(normalizeInstance("not a server")).toBeNull();
    expect(normalizeInstance("")).toBeNull();
  });

  it("uploads the image, waits for it, then posts with the post's id as the idempotency key", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-mastodon-"));
    const image = path.join(dir, "0000-aaaa.png");
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const seen: { url: string; headers?: HeadersInit; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, headers: init?.headers, body: init?.body });
        if (url.endsWith("/api/v2/media")) return Response.json({ id: "m1", url: null }, { status: 202 });
        if (url.endsWith("/api/v1/media/m1")) return Response.json({ id: "m1", url: "https://files/m1.png" });
        return Response.json({ url: "https://mastodon.social/@me/1" });
      }),
    );
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as typeof setTimeout);

    const r = await postToMastodon("https://mastodon.social", "tok", "Hello", { imagePath: image, idempotencyKey: "post-42" });
    expect(r).toEqual({ url: "https://mastodon.social/@me/1" });
    const status = seen.at(-1)!;
    expect(status.url).toBe("https://mastodon.social/api/v1/statuses");
    expect(JSON.parse(String(status.body))).toEqual({ status: "Hello", media_ids: ["m1"] });
    expect(status.headers).toMatchObject({ Authorization: "Bearer tok", "Idempotency-Key": "post-42" });
  });
});
