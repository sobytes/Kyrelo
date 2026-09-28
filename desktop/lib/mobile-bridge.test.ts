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

  it("refuses everything outside the Monitor", async () => {
    const before = apiCalls.length;
    for (const [method, path] of [
      ["POST", "/api/mobile"], // phone access settings: never from the phone
      ["PUT", "/api/settings/keys"],
      ["POST", "/api/deleter"],
      ["POST", "/api/scheduler/posts"],
      ["DELETE", "/api/grok-state"],
    ]) {
      expect((await call(path, { method, body: "{}" })).status).toBe(404);
    }
    expect(apiCalls.length).toBe(before);
  });

  it("rejects requests without the pairing token or with a wrong one", async () => {
    expect((await call("/api/grok-state", {}, null)).status).toBe(401);
    expect((await call("/api/grok-state", {}, "wrong")).status).toBe(401);
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
