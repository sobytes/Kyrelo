import { afterEach, describe, expect, it, vi } from "vitest";
import { listThreadsComments, postToThreads, refreshedToken, THREADS_RECONNECT } from "./threads";

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

describe("Threads comments", () => {
  const now = new Date("2026-10-01T12:00:00Z").getTime();

  it("reads replies on the last week's posts, leaving out your own", async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        paths.push(path);
        if (path === "/v1.0/1789/threads") {
          return Response.json({
            data: [
              { id: "p1", text: "new post", timestamp: "2026-09-30T12:00:00Z" },
              { id: "p0", text: "old post", timestamp: "2026-09-01T12:00:00Z" },
            ],
          });
        }
        return Response.json({
          data: [
            { id: "r1", text: "nice", username: "fan", timestamp: "2026-10-01T11:00:00Z", permalink: "https://threads.net/r1" },
            { id: "r2", text: "my own answer", username: "Kyrelo", timestamp: "2026-10-01T11:30:00Z" },
          ],
        });
      }),
    );
    const comments = await listThreadsComments("1789", "kyrelo", "tok", now);
    expect(paths).toEqual(["/v1.0/1789/threads", "/v1.0/p1/replies"]);
    expect(comments).toEqual([
      { id: "r1", username: "fan", text: "nice", url: "https://threads.net/r1", postedAt: "2026-10-01T11:00:00Z", postText: "new post" },
    ]);
  });

  it("asks for a new token when it can't read replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).pathname.endsWith("/replies")
          ? Response.json({ error: { message: "(#10) Application does not have permission for this action" } }, { status: 403 })
          : Response.json({ data: [{ id: "p1", timestamp: "2026-10-01T00:00:00Z" }] }),
      ),
    );
    await expect(listThreadsComments("1789", "kyrelo", "tok", now)).rejects.toThrow(THREADS_RECONNECT);
  });

  it("posts a reply with reply_to_id", async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(new URL(url));
        return Response.json({ id: "x", permalink: "https://threads.net/x" });
      }),
    );
    await postToThreads("1789", "tok", "thanks!", "r1");
    expect(urls[0].searchParams.get("reply_to_id")).toBe("r1");
  });
});
