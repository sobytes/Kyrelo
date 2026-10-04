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
