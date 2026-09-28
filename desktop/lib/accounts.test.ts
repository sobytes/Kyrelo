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
    expect(await accounts.connectBluesky("@me.bsky.social", " secret-pass ")).toEqual({ ok: true, handle: "Me.bsky.social" });
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
    const r = await accounts.connectBluesky("other.bsky.social", "wrong");
    expect(r).toEqual({ error: "Bluesky: Invalid identifier or password" });
    expect((await storage.listAccounts("bluesky")).map((a) => a.id)).toEqual(["me.bsky.social"]);
  });

  it("disconnecting Bluesky forgets its app password", async () => {
    expect(await accounts.disconnectAccount("bluesky", "me.bsky.social")).toEqual({ ok: true });
    expect(await storage.listAccounts("bluesky")).toEqual([]);
    expect(await storage.getAccountSecret("bluesky", "me.bsky.social")).toBeNull();
  });
});
