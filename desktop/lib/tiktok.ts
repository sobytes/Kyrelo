import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { videoTypeForFilename } from "./uploads";

// TikTok through its Content Posting API, signed in with the user's own
// TikTok developer app (Login Kit for Desktop, Content Posting API with
// "Upload"). Kyrelo sends the video to the user's TikTok inbox: TikTok
// notifies them, and they add the caption and post it from the app. Posting
// directly needs TikTok to audit the app; until then TikTok keeps
// directly-posted videos private, so the inbox is the route that works for
// everyone.

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";
const TIMEOUT_MS = 30_000;
const SCOPES = "user.info.basic,video.upload";
/** TikTok takes chunks of 5–64 MB; the last one absorbs the remainder (up to 128 MB). */
const CHUNK_BYTES = 10 * 1024 * 1024;
const SINGLE_UPLOAD_MAX = 64 * 1024 * 1024;

export interface TikTokApp {
  clientId: string;
  clientSecret: string;
}

/**
 * TikTok's desktop sign-in requires PKCE, but with the challenge as the hex
 * SHA-256 of the verifier, not base64url as in the OAuth standard.
 */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("hex");
}

export function authorizeUrl(clientKey: string, redirectUri: string, state: string, verifier: string): string {
  const q = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${q}`;
}

interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  open_id: string;
}

async function token(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<Tokens> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`TikTok: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`);
  return json as Tokens;
}

export function exchangeCode(app: TikTokApp, code: string, redirectUri: string, verifier: string): Promise<Tokens> {
  return token({
    client_key: app.clientId,
    client_secret: app.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

/**
 * A fresh access token (they last a day). TikTok may send a new refresh token
 * with it, which replaces the old one: the caller must save it.
 */
export function refreshTokens(app: TikTokApp, refreshToken: string): Promise<Tokens> {
  return token({ client_key: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
}

async function api<T>(accessToken: string, endpoint: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
    throw new Error(`TikTok: ${json.error?.message || json.error?.code || `HTTP ${res.status}`}`);
  }
  return json.data as T;
}

export async function userInfo(accessToken: string): Promise<{ open_id: string; display_name: string }> {
  const { user } = await api<{ user: { open_id: string; display_name: string } }>(accessToken, "user/info/?fields=open_id,display_name");
  return user;
}

/** How a video of `size` bytes is split: TikTok's chunk rules. */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= SINGLE_UPLOAD_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK_BYTES, count: Math.floor(size / CHUNK_BYTES) };
}

/** Sends the video to the user's TikTok inbox, to finish and post from the app. */
export async function uploadToTikTokInbox(accessToken: string, videoPath: string): Promise<{ url: string }> {
  const data = await fs.readFile(videoPath);
  const type = videoTypeForFilename(path.basename(videoPath)) ?? "video/mp4";
  const { chunkSize, count } = chunkPlan(data.length);
  const { upload_url } = await api<{ publish_id: string; upload_url: string }>(accessToken, "post/publish/inbox/video/init/", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      source_info: { source: "FILE_UPLOAD", video_size: data.length, chunk_size: chunkSize, total_chunk_count: count },
    }),
  });
  // In order: TikTok takes chunks one after another.
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? data.length : start + chunkSize;
    const res = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end - 1}/${data.length}` },
      body: new Uint8Array(data.subarray(start, end)),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!res.ok) throw new Error(`TikTok: the upload stopped at part ${i + 1} of ${count} (HTTP ${res.status}).`);
  }
  // There's no post yet: the user finishes it in the app.
  return { url: "https://www.tiktok.com/" };
}
