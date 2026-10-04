import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLemmyHandle, postToLemmy } from "./lemmy";

afterEach(() => vi.unstubAllGlobals());

describe("Lemmy", () => {
  it("reads the account as user@instance", () => {
    expect(parseLemmyHandle("@me@Lemmy.World")).toEqual({ username: "me", instance: "https://lemmy.world" });
    expect(parseLemmyHandle("me")).toBeNull();
  });

  it("signs in, then posts the first line as the title", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return url.endsWith("/user/login") ? Response.json({ jwt: "jwt-1" }) : Response.json({ post_view: { post: { id: 77 } } });
      }),
    );
    const login = { instance: "https://lemmy.world", username: "me", password: "pw" };
    expect(await postToLemmy(login, 5, "Title here\nBody here")).toEqual({ url: "https://lemmy.world/post/77" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: "Title here", community_id: 5, body: "Body here" });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-1");
  });
});

describe("Lemmy comments", () => {
  it("lists replies on this community's posts and answers under the comment", async () => {
    const { listLemmyComments, replyOnLemmy } = await import("./lemmy");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/user/login")) return Response.json({ jwt: "jwt" });
        if (url.includes("/user/replies")) {
          const view = (id: number, community: number) => ({
            comment: { id, content: `reply ${id}`, published: "2026-10-04T09:00:00.000000Z", ap_id: `https://lemmy.ml/comment/${id}` },
            creator: { name: "fan", actor_id: "https://lemmy.ml/u/fan" },
            post: { id: 9, name: "My post", body: "Body", community_id: community },
          });
          return Response.json({ replies: [view(1, 5), view(2, 6)] });
        }
        return Response.json({ comment_view: { comment: { ap_id: "https://lemmy.world/comment/3" } } });
      }),
    );
    const login = { instance: "https://lemmy.world", username: "me", password: "pw" };
    expect(await listLemmyComments(login, 5)).toEqual([
      { id: 1, postId: 9, author: "fan@lemmy.ml", text: "reply 1", url: "https://lemmy.ml/comment/1", postedAt: "2026-10-04T09:00:00.000000Z", postText: "My post\n\nBody" },
    ]);
    expect(await replyOnLemmy(login, { id: 1, postId: 9 }, "thanks")).toEqual({ url: "https://lemmy.world/comment/3" });
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ content: "thanks", post_id: 9, parent_id: 1 });
  });
});
