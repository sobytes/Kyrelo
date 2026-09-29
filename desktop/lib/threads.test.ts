import { afterEach, describe, expect, it, vi } from "vitest";
import { postToThreads, refreshedToken } from "./threads";

afterEach(() => vi.unstubAllGlobals());

describe("Threads", () => {
  it("creates a container, publishes it (retrying while it isn't ready) and returns the permalink", async () => {
    const calls: string[] = [];
    let publishAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        calls.push(path);
        if (path.endsWith("/threads")) return Response.json({ id: "container-1" });
        if (path.endsWith("/threads_publish")) {
          publishAttempts++;
          return publishAttempts === 1
            ? Response.json({ error: { message: "Media not ready" } }, { status: 400 })
            : Response.json({ id: "post-9" });
        }
        return Response.json({ permalink: "https://www.threads.net/@kyrelo/post/abc" });
      }),
    );
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as typeof setTimeout);

    expect(await postToThreads("1789", "tok", "Hello Threads")).toEqual({ url: "https://www.threads.net/@kyrelo/post/abc" });
    expect(calls).toEqual(["/v1.0/1789/threads", "/v1.0/1789/threads_publish", "/v1.0/1789/threads_publish", "/v1.0/post-9"]);
  });

  it("refreshes a token only when it's a week old", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "new-token" })));
    const now = new Date("2026-09-30T00:00:00Z").getTime();
    expect(await refreshedToken("tok", "2026-09-28T00:00:00Z", now)).toBeNull();
    expect(await refreshedToken("tok", "2026-09-20T00:00:00Z", now)).toBe("new-token");
    expect(await refreshedToken("tok", undefined, now)).toBe("new-token");
  });
});
