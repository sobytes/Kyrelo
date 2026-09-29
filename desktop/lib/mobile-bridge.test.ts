import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleBridgeRequest, pairingLink } from "./mobile-bridge";

const TOKEN = "correct-token-abc";
let bridgeUrl: string;
let api: http.Server;
let bridge: http.Server;
const apiCalls: { method?: string; url?: string; body: string }[] = [];

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );
}

beforeAll(async () => {
  // A stand-in for Kyrelo's own API that records what the bridge forwards.
  api = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    apiCalls.push({ method: req.method, url: req.url, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ from: "api", path: req.url }));
  });
  process.env.APP_URL = await listen(api);
  bridge = http.createServer((req, res) => void handleBridgeRequest(req, res, TOKEN));
  bridgeUrl = await listen(bridge);
});

afterAll(() => {
  api.close();
  bridge.close();
});

const call = (path: string, init: RequestInit = {}, token: string | null = TOKEN) =>
  fetch(`${bridgeUrl}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
  });

describe("phone bridge", () => {
  it("answers a ping when paired", async () => {
    expect(await (await call("/ping")).json()).toEqual({ ok: true, app: "kyrelo" });
  });

  it("forwards allowed Monitor calls to the local API unchanged", async () => {
    const res = await call("/api/grok-reply", { method: "POST", body: JSON.stringify({ action: "draft", tweetId: "1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "api", path: "/api/grok-reply" });
    expect(apiCalls.at(-1)).toEqual({ method: "POST", url: "/api/grok-reply", body: '{"action":"draft","tweetId":"1"}' });
  });

  it("forwards Scheduler and campaign calls, including ones with ids", async () => {
    for (const [method, path] of [
      ["GET", "/api/accounts"],
      ["POST", "/api/scheduler/posts"],
      ["PATCH", "/api/scheduler/posts/5f1c9e2a-1111-4a4a-9b9b-123456789abc"],
      ["DELETE", "/api/scheduler/posts/5f1c9e2a-1111-4a4a-9b9b-123456789abc"],
      ["GET", "/api/campaigns/abc-123"],
      ["POST", "/api/campaigns/abc-123/schedule"],
      ["DELETE", "/api/campaigns/abc-123"],
      ["GET", "/api/brand-profile"],
    ]) {
      const res = await call(path, { method, body: method === "GET" ? undefined : "{}" });
      expect(res.status, `${method} ${path}`).toBe(200);
      expect(apiCalls.at(-1)?.url).toBe(path);
    }
  });

  it("refuses everything the phone doesn't need", async () => {
    const before = apiCalls.length;
    for (const [method, path] of [
      ["POST", "/api/mobile"], // phone access settings: never from the phone
      ["PUT", "/api/settings/keys"],
      ["POST", "/api/deleter"],
      ["POST", "/api/unfollow"],
      ["GET", "/api/unfollow"],
      ["POST", "/api/accounts"], // connecting / disconnecting accounts
      ["DELETE", "/api/grok-state"],
      ["PATCH", "/api/scheduler/posts/a/../../settings/keys"],
      ["GET", "/api/campaigns/abc/secret"],
    ]) {
      const res = await call(path, { method, body: method === "GET" ? undefined : "{}" });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(apiCalls.length).toBe(before);
  });

  it("rejects requests without the pairing token or with a wrong one", async () => {
    expect((await call("/api/grok-state", {}, null)).status).toBe(401);
    expect((await call("/api/grok-state", {}, "wrong")).status).toBe(401);
  });

  it("forwards a photo upload with its multipart type, and only as multipart", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(200_000)], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(`${bridgeUrl}/api/scheduler/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
    expect(res.status).toBe(200);
    expect(apiCalls.at(-1)?.url).toBe("/api/scheduler/upload");
    expect(apiCalls.at(-1)?.body.length).toBeGreaterThan(200_000); // not cut at the 64 KB JSON limit

    const json = await call("/api/scheduler/upload", { method: "POST", body: "{}" });
    expect(json.status).toBe(400);
  });

  it("rejects oversized requests", async () => {
    const res = await call("/api/grok-reply", { method: "POST", body: "x".repeat(70_000) });
    expect(res.status).toBe(413);
  });

  it("locks out an address after repeated wrong tokens", async () => {
    for (let i = 0; i < 10; i++) await call("/ping", {}, `guess-${i}`);
    // Even the right token is refused while locked out.
    expect((await call("/ping")).status).toBe(429);
  });

  it("puts every address, the port and the token in the pairing link", () => {
    const link = new URL(pairingLink("tok123"));
    expect(link.protocol).toBe("kyrelo:");
    expect(link.searchParams.get("token")).toBe("tok123");
    expect(Number(link.searchParams.get("port"))).toBeGreaterThan(0);
  });
});
