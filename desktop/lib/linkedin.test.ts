import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeLittleText, LINKEDIN_EXPIRED, postToLinkedIn } from "./linkedin";

afterEach(() => vi.unstubAllGlobals());

describe("LinkedIn", () => {
  it("escapes LinkedIn's markup characters so they post as written", () => {
    expect(escapeLittleText("Ship it (today) #launch @team_a")).toBe("Ship it \\(today\\) \\#launch \\@team\\_a");
  });

  it("posts as the member and links to the new post", async () => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
        return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:77" } });
      }),
    );
    expect(await postToLinkedIn("tok", "abc", "hello")).toEqual({ url: "https://www.linkedin.com/feed/update/urn:li:share:77/" });
    expect(seen[0].url).toBe("https://api.linkedin.com/rest/posts");
    expect(seen[0].headers["LinkedIn-Version"]).toMatch(/^\d{6}$/);
    expect(seen[0].body).toMatchObject({ author: "urn:li:person:abc", commentary: "hello", visibility: "PUBLIC", lifecycleState: "PUBLISHED" });
  });

  it("says the token expired on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(postToLinkedIn("tok", "abc", "hello")).rejects.toThrow(LINKEDIN_EXPIRED);
  });
});
