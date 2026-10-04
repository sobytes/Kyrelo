import { afterEach, describe, expect, it, vi } from "vitest";
import { listFacebookComments, listInstagramComments, replyOnFacebook, replyOnInstagram, verifyFacebookPageToken } from "./meta";

afterEach(() => vi.unstubAllGlobals());

const now = new Date("2026-10-01T12:00:00Z").getTime();

/** Answers by URL path; records each request. */
function mockGraph(routes: Record<string, unknown>) {
  const requests: { method: string; url: URL }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      requests.push({ method: init?.method ?? "GET", url: u });
      const path = u.pathname.replace(/^\/v[\d.]+/, "");
      return path in routes ? Response.json(routes[path]) : Response.json({ error: { message: `no route ${path}` } }, { status: 404 });
    }),
  );
  return requests;
}

describe("Instagram comments", () => {
  it("reads comments on the last week's posts, leaving out your own", async () => {
    mockGraph({
      "/me/media": {
        data: [
          { id: "m1", caption: "launch day", timestamp: "2026-09-30T10:00:00+0000", permalink: "https://instagram.com/p/m1" },
          { id: "m0", caption: "old", timestamp: "2026-08-01T10:00:00+0000", permalink: "https://instagram.com/p/m0" },
        ],
      },
      "/m1/comments": {
        data: [
          { id: "c1", text: "congrats!", username: "fan", timestamp: "2026-10-01T09:00:00+0000" },
          { id: "c2", text: "thanks all", username: "Me.Brand", timestamp: "2026-10-01T09:30:00+0000" },
        ],
      },
    });
    expect(await listInstagramComments("me.brand", "tok", now)).toEqual([
      { id: "c1", author: "fan", text: "congrats!", url: "https://instagram.com/p/m1", postedAt: "2026-10-01T09:00:00+0000", postText: "launch day" },
    ]);
  });

  it("replies to the comment", async () => {
    const requests = mockGraph({ "/c1/replies": { id: "r1" } });
    await replyOnInstagram("tok", "c1", "thank you!");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url.searchParams.get("message")).toBe("thank you!");
  });
});

describe("Facebook Page comments", () => {
  it("refuses a personal-profile token", async () => {
    mockGraph({ "/me": { id: "u1", name: "Sam" } });
    await expect(verifyFacebookPageToken("tok")).rejects.toThrow(/personal profile/);
    mockGraph({ "/me": { id: "p1", name: "Kyrelo", category: "Software" } });
    expect(await verifyFacebookPageToken("tok")).toEqual({ id: "p1", name: "Kyrelo" });
  });

  it("reads top-level comments on recent posts, leaving out the Page's own", async () => {
    const requests = mockGraph({
      "/p1/posts": { data: [{ id: "p1_9", message: "we shipped", created_time: "2026-09-30T10:00:00+0000" }] },
      "/p1_9/comments": {
        data: [
          { id: "c1", message: "nice", from: { id: "u2", name: "Alex" }, created_time: "2026-10-01T08:00:00+0000", permalink_url: "https://facebook.com/c1" },
          { id: "c2", message: "thanks", from: { id: "p1", name: "Kyrelo" }, created_time: "2026-10-01T08:10:00+0000" },
          { id: "c3", message: "who am i", created_time: "2026-10-01T08:20:00+0000" },
        ],
      },
    });
    const comments = await listFacebookComments("p1", "tok", now);
    expect(comments.map((c) => [c.id, c.author, c.url])).toEqual([
      ["c1", "Alex", "https://facebook.com/c1"],
      ["c3", "someone", "https://www.facebook.com/p1_9"],
    ]);
    expect(requests[1].url.searchParams.get("filter")).toBe("toplevel");
  });

  it("replies and returns the reply's link", async () => {
    mockGraph({ "/c1/comments": { id: "r1" }, "/r1": { permalink_url: "https://facebook.com/r1" } });
    expect(await replyOnFacebook("tok", "c1", "thanks!")).toEqual({ url: "https://facebook.com/r1" });
  });
});
