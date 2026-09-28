import http from "node:http";
import os from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getMobileBridgeConfig, saveMobileBridgeConfig } from "./storage";

// The phone app's way in. Kyrelo's API only answers this computer
// (middleware.ts, and the server binds 127.0.0.1), so a paired phone talks to
// this small separate server instead. It:
//   - runs only while phone access is turned on,
//   - requires the pairing token on every request,
//   - forwards ONLY the Monitor endpoints below to the local API, so the phone
//     gets exactly the same behaviour and validation as the desktop.
// Traffic is plain HTTP: private on Tailscale (encrypted), readable by others
// on a shared Wi-Fi network. The Settings page says so.

export const BRIDGE_PORT = Number(process.env.MOBILE_BRIDGE_PORT ?? 47771);

/** method + path the phone may call. Everything else gets 404. */
const ALLOWED = new Set([
  "GET /api/grok-state", // the feed, with drafts
  "GET /api/grok-settings",
  "PUT /api/grok-settings", // watching on/off, Autopilot settings
  "POST /api/grok-reply", // draft replies, mark as replied
  "POST /api/grok-run", // check now
]);

const MAX_BODY_BYTES = 64 * 1024;
// Wrong tokens per address before it's locked out for the window.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 10 * 60_000;

function localApiUrl(): string {
  return process.env.APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

interface BridgeState {
  server: http.Server | null;
  failures: Map<string, { count: number; since: number }>;
}

// On globalThis so Next's dev hot-reload doesn't start a second server.
const state: BridgeState = ((globalThis as { __kyreloBridge?: BridgeState }).__kyreloBridge ??= {
  server: null,
  failures: new Map(),
});

function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isLockedOut(ip: string): boolean {
  const f = state.failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > FAILURE_WINDOW_MS) {
    state.failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(ip: string) {
  const f = state.failures.get(ip);
  if (f && Date.now() - f.since <= FAILURE_WINDOW_MS) f.count++;
  else state.failures.set(ip, { count: 1, since: Date.now() });
}

function send(res: http.ServerResponse, status: number, body: object) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Handles one phone request. Exported for tests. */
export async function handleBridgeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string,
): Promise<void> {
  const ip = req.socket.remoteAddress ?? "unknown";
  if (isLockedOut(ip)) return send(res, 429, { error: "too many failed attempts, try again later" });

  const given = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!given || !tokensMatch(given, token)) {
    recordFailure(ip);
    return send(res, 401, { error: "not paired" });
  }

  const url = new URL(req.url ?? "/", "http://bridge");
  const route = `${req.method} ${url.pathname}`;
  if (route === "GET /ping") return send(res, 200, { ok: true, app: "kyrelo" });
  if (!ALLOWED.has(route)) return send(res, 404, { error: "not available to the phone app" });

  const body = req.method === "GET" ? undefined : await readBody(req);
  if (body === null) return send(res, 413, { error: "request too large" });

  try {
    const upstream = await fetch(`${localApiUrl()}${url.pathname}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(180_000),
    });
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    send(res, 502, { error: `Kyrelo didn't answer: ${err instanceof Error ? err.message : String(err)}` });
  }
}

/** Starts or stops the bridge to match the saved config. */
export async function syncMobileBridge(): Promise<void> {
  const config = await getMobileBridgeConfig();
  if (!config.enabled || !config.token) {
    if (state.server) {
      await new Promise<void>((resolve) => state.server!.close(() => resolve()));
      state.server = null;
      console.log("[mobile-bridge] stopped");
    }
    return;
  }
  // Restart so a reset token takes effect for new requests.
  if (state.server) {
    await new Promise<void>((resolve) => state.server!.close(() => resolve()));
    state.server = null;
  }
  const token = config.token;
  const server = http.createServer((req, res) => {
    handleBridgeRequest(req, res, token).catch((err) => send(res, 500, { error: String(err) }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(BRIDGE_PORT, "0.0.0.0", () => resolve());
  });
  state.server = server;
  console.log(`[mobile-bridge] listening on :${BRIDGE_PORT}`);
}

export async function setMobileBridgeEnabled(enabled: boolean): Promise<void> {
  const config = await getMobileBridgeConfig();
  await saveMobileBridgeConfig({ enabled, token: config.token ?? newToken() });
  await syncMobileBridge();
}

/** New pairing token: already-paired phones must scan again. */
export async function resetMobilePairing(): Promise<void> {
  const config = await getMobileBridgeConfig();
  await saveMobileBridgeConfig({ ...config, token: newToken() });
  await syncMobileBridge();
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface BridgeAddress {
  address: string;
  kind: "tailscale" | "lan";
}

/** This computer's addresses a phone could reach, Tailscale first. */
export function bridgeAddresses(): BridgeAddress[] {
  const out: BridgeAddress[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family !== "IPv4" || n.internal) continue;
      // Tailscale hands out addresses in 100.64.0.0/10.
      const [a, b] = n.address.split(".").map(Number);
      out.push({ address: n.address, kind: a === 100 && b >= 64 && b <= 127 ? "tailscale" : "lan" });
    }
  }
  return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "tailscale" ? -1 : 1));
}

/** The link the phone app scans: every address to try, the port and the token. */
export function pairingLink(token: string): string {
  const hosts = bridgeAddresses().map((a) => a.address).join(",");
  return `kyrelo://pair?hosts=${encodeURIComponent(hosts)}&port=${BRIDGE_PORT}&token=${token}`;
}
