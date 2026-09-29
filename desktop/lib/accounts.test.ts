import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// storage.ts reads STORAGE_DIR at import time, so point it at a temp dir first.
let dir: string;
let storage: typeof import("./storage");
let accounts: typeof import("./accounts");
let route: typeof import("@/app/api/accounts/route");
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kyrelo-accounts-"));
  process.env.STORAGE_DIR = dir;
  // An install from before multi-platform support: X accounts without `platform`.
  await writeFile(
    path.join(dir, "x-accounts.json"),
    JSON.stringify([{ id: "kyreloapp", handle: "KyreloApp", addedAt: "2026-09-01T00:00:00Z" }]),
  );
  storage = await import("./storage");
  accounts = await import("./accounts");
  route = await import("@/app/api/accounts/route");
});

afterEach(() => vi.unstubAllGlobals());

function blueskyAccepts(handle: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ did: "did:plc:1", handle, accessJwt: "jwt" }), { status: 200 })),
  );
}

describe("accounts", () => {
  it("treats existing X-only accounts as X accounts", async () => {
    expect(await storage.listAccounts()).toEqual([
      { id: "kyreloapp", handle: "KyreloApp", addedAt: "2026-09-01T00:00:00Z", platform: "twitter" },
    ]);
    expect(await accounts.defaultXAccountId()).toBe("kyreloapp");
  });

  it("connects Bluesky with an app password and never exposes the password", async () => {
    blueskyAccepts("Me.bsky.social");
    expect(await accounts.connectWithCredentials("bluesky", { handle: "@me.bsky.social", appPassword: " secret-pass " })).toEqual({
      ok: true,
      handle: "Me.bsky.social",
    });
    // The legacy X account survived the first write.
    expect((await storage.listAccounts()).map((a) => `${a.platform}:${a.id}`)).toEqual([
      "twitter:kyreloapp",
      "bluesky:me.bsky.social",
    ]);
    expect(await storage.getAccountSecret("bluesky", "me.bsky.social")).toEqual({ appPassword: "secret-pass" });
    const listed = JSON.stringify(await (await route.GET()).json());
    expect(listed).not.toContain("secret-pass");
  });

  it("reports Bluesky's reason and saves nothing when the password is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Invalid identifier or password" }), { status: 401 })),
    );
    const r = await accounts.connectWithCredentials("bluesky", { handle: "other.bsky.social", appPassword: "wrong" });
    expect(r).toEqual({ error: "Bluesky: Invalid identifier or password" });
    expect((await storage.listAccounts("bluesky")).map((a) => a.id)).toEqual(["me.bsky.social"]);
  });

  it("disconnecting Bluesky forgets its app password", async () => {
    expect(await accounts.disconnectAccount("bluesky", "me.bsky.social")).toEqual({ ok: true });
    expect(await storage.listAccounts("bluesky")).toEqual([]);
    expect(await storage.getAccountSecret("bluesky", "me.bsky.social")).toBeNull();
  });

  it("connects Mastodon through the browser: register, approve, save", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/api/v1/apps")) return Response.json({ client_id: "cid", client_secret: "csecret" });
        if (url.endsWith("/oauth/token")) {
          expect(JSON.parse(String(init?.body))).toMatchObject({ code: "the-code", client_id: "cid", client_secret: "csecret" });
          return Response.json({ access_token: "mastodon-token" });
        }
        if (url.endsWith("/api/v1/accounts/verify_credentials")) return Response.json({ acct: "me", username: "Me" });
        return new Response("{}", { status: 404 });
      }),
    );
    const start = await accounts.startMastodonConnect("https://Mastodon.Social/@someone", "http://127.0.0.1:3000");
    if (!("authorizeUrl" in start)) throw new Error(start.error);
    const url = new URL(start.authorizeUrl);
    expect(url.origin).toBe("https://mastodon.social");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/accounts/mastodon/callback");

    // A made-up state is refused; the real one works once.
    expect(await accounts.finishMastodonConnect("forged", "the-code")).toEqual({
      error: "This sign-in link has expired. Start again from Kyrelo.",
    });
    const state = url.searchParams.get("state")!;
    expect(await accounts.finishMastodonConnect(state, "the-code")).toEqual({ ok: true, handle: "Me@mastodon.social" });
    expect(await accounts.finishMastodonConnect(state, "the-code")).toHaveProperty("error");

    expect(await storage.getAccountSecret("mastodon", "me@mastodon.social")).toEqual({
      instance: "https://mastodon.social",
      token: "mastodon-token",
    });
    expect(JSON.stringify(await (await route.GET()).json())).not.toContain("mastodon-token");
  });

  it("asks for a real Mastodon server", async () => {
    expect(await accounts.startMastodonConnect("not a server", "http://127.0.0.1:3000")).toEqual({
      error: "Enter your Mastodon server, like mastodon.social.",
    });
  });

  it("connects Threads with a token it checks first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "1789", username: "Kyrelo" })));
    expect(await accounts.connectWithCredentials("threads", { token: " tok " })).toEqual({ ok: true, handle: "Kyrelo" });
    expect(await storage.getAccountSecret("threads", "kyrelo")).toMatchObject({ token: "tok", userId: "1789" });
  });
});

