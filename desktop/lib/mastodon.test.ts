import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlToText, listMastodonComments, MASTODON_RECONNECT, normalizeInstance, postToMastodon, replyOnMastodon } from "./mastodon";

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

describe("Mastodon comments", () => {
  const status = (id: string, inReplyToAccount: string | null, visibility = "public") => ({
    id,
    content: `<p>hi <span>there</span> &amp; you</p><p>line2</p>`,
    url: `https://mastodon.social/@x/${id}`,
    created_at: "2026-10-01T10:00:00Z",
    visibility,
    in_reply_to_id: "mine-1",
    in_reply_to_account_id: inReplyToAccount,
  });

  it("turns Mastodon's HTML into plain text", () => {
    expect(htmlToText("<p>a<br>b &lt;3</p><p>c</p>")).toBe("a\nb <3\n\nc");
  });

  it("keeps replies to your posts and leaves out DMs, your own posts and mentions elsewhere", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/verify_credentials")) return Response.json({ id: "me", acct: "me", username: "me" });
        if (url.includes("/notifications")) {
          return Response.json([
            { account: { id: "a", acct: "fan@other.social" }, status: status("1", "me") },
            { account: { id: "b", acct: "dm" }, status: status("2", "me", "direct") },
            { account: { id: "c", acct: "elsewhere" }, status: status("3", "someone-else") },
            { account: { id: "me", acct: "me" }, status: status("4", "me") },
          ]);
        }
        return Response.json({ ...status("mine-1", null), content: "<p>my post</p>" });
      }),
    );
    const comments = await listMastodonComments("https://mastodon.social", "tok");
    expect(comments).toEqual([
      {
        id: "1",
        acct: "fan@other.social",
        text: "hi there & you\n\nline2",
        url: "https://mastodon.social/@x/1",
        postedAt: "2026-10-01T10:00:00Z",
        visibility: "public",
        postText: "my post",
      },
    ]);
  });

  it("asks to reconnect when the token can't read notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/verify_credentials")
          ? Response.json({ id: "me", acct: "me", username: "me" })
          : Response.json({ error: "This action is outside the authorized scopes" }, { status: 403 }),
      ),
    );
    await expect(listMastodonComments("https://mastodon.social", "tok")).rejects.toThrow(MASTODON_RECONNECT);
  });

  it("replies with the commenter's handle, in the comment's visibility", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({ url: "https://mastodon.social/@me/9" });
      }),
    );
    const comment = { id: "1", acct: "fan@other.social", visibility: "private" as const };
    await replyOnMastodon("https://mastodon.social", "tok", comment, "thanks!");
    await replyOnMastodon("https://mastodon.social", "tok", comment, "@Fan@other.social already named");
    expect(bodies).toEqual([
      { status: "@fan@other.social thanks!", in_reply_to_id: "1", visibility: "private" },
      { status: "@Fan@other.social already named", in_reply_to_id: "1", visibility: "private" },
    ]);
  });
});
