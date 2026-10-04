import { promises as fs } from "node:fs";
import path from "node:path";
import { splitTitle } from "./title";
import { videoTypeForFilename } from "./uploads";

// YouTube through the YouTube Data API, signed in with the user's own Google
// Cloud OAuth client ("Desktop app" type, which may redirect back to this
// computer on any port). Google keeps videos uploaded by projects it hasn't
// audited private, until the user requests its free API audit; comments work
// either way.
//
// Quota: each project gets 10,000 units a day. An upload costs 1,600 (so
// about six a day), a reply 50, reading comments 1 per page.

const OAUTH = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const TIMEOUT_MS = 30_000;
/** Uploads can be hundreds of MB. */
const UPLOAD_TIMEOUT_MS = 30 * 60_000;
// Upload videos, read and answer comments.
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export interface GoogleApp {
  clientId: string;
  clientSecret: string;
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
    error_description?: string;
  };
  if (!res.ok) {
    const e = json.error;
    const message = typeof e === "object" ? e?.message : (json.error_description ?? e);
    throw new Error(`YouTube: ${message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // A refresh token, so Kyrelo can post while the user is away.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Swaps the code from Google's redirect for a refresh token. */
export async function exchangeCode(app: GoogleApp, code: string, redirectUri: string): Promise<string> {
  const res = await fetch(OAUTH, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const { refresh_token } = await parse<{ refresh_token?: string }>(res);
  if (!refresh_token) throw new Error("YouTube: Google didn't send a refresh token. Remove Kyrelo's access in your Google account and connect again.");
  return refresh_token;
}

// Access tokens last an hour; one per refresh token is reused until then.
const accessTokens = ((globalThis as { __kyreloYouTube?: Map<string, { token: string; expires: number }> }).__kyreloYouTube ??=
  new Map());

export async function accessToken(app: GoogleApp, refreshToken: string): Promise<string> {
  const cached = accessTokens.get(refreshToken);
  if (cached && cached.expires > Date.now()) return cached.token;
  const res = await fetch(OAUTH, {
    method: "POST",
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json;
  try {
    json = await parse<{ access_token: string; expires_in: number }>(res);
  } catch (err) {
    // Google's "invalid_grant": access was removed, or the OAuth app is still
    // in Testing, where Google expires refresh tokens after a week.
    if (/invalid_grant|expired|revoked/i.test(String(err))) {
      throw new Error(
        "YouTube: Google ended Kyrelo's access. Set your OAuth app's publishing status to In production (so access lasts), then reconnect under Accounts.",
      );
    }
    throw err;
  }
  accessTokens.set(refreshToken, { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 });
  return json.access_token;
}

async function get<T>(token: string, endpoint: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${endpoint}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return parse<T>(res);
}

/** The signed-in user's channel. */
export async function myChannel(token: string): Promise<{ id: string; title: string; handle?: string }> {
  const { items } = await get<{ items?: { id: string; snippet: { title: string; customUrl?: string } }[] }>(token, "channels", {
    part: "snippet",
    mine: "true",
  });
  const channel = items?.[0];
  if (!channel) throw new Error("YouTube: this Google account has no YouTube channel yet. Create one, then connect again.");
  return { id: channel.id, title: channel.snippet.title, handle: channel.snippet.customUrl };
}

/** YouTube refuses titles and descriptions containing angle brackets. */
const clean = (s: string) => s.replace(/[<>]/g, "");

/** The post's first line is the video's title (YouTube allows 100 characters); the whole text is its description. */
export function videoMetadata(text: string): { title: string; description: string } {
  const { title } = splitTitle(clean(text), 100);
  return { title: title || "Untitled", description: clean(text) };
}

/** Uploads the video as public (unless YouTube keeps it private) and returns its URL. */
export async function uploadToYouTube(token: string, videoPath: string, text: string): Promise<{ url: string }> {
  const data = await fs.readFile(videoPath);
  const type = videoTypeForFilename(path.basename(videoPath)) ?? "video/mp4";
  // A resumable upload: metadata first, then the bytes to the URL Google returns.
  const start = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
      "X-Upload-Content-Length": String(data.length),
    },
    body: JSON.stringify({
      snippet: videoMetadata(text),
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!start.ok) await parse(start);
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube: the upload didn't start. Try again.");
  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const video = await parse<{ id: string }>(put);
  return { url: `https://www.youtube.com/watch?v=${video.id}` };
}

/** A top-level comment on one of the channel's videos. */
export interface YouTubeComment {
  id: string;
  videoId: string;
  author: string;
  text: string;
  postedAt: string;
  postText: string;
}

interface Thread {
  snippet: {
    videoId?: string;
    topLevelComment: {
      id: string;
      snippet: { textDisplay: string; authorDisplayName: string; authorChannelId?: { value: string }; publishedAt: string };
    };
  };
}

/** The newest comments on the channel's videos, with each video's title and description for context. */
export async function listYouTubeComments(token: string, channelId: string): Promise<YouTubeComment[]> {
  const { items = [] } = await get<{ items?: Thread[] }>(token, "commentThreads", {
    part: "snippet",
    allThreadsRelatedToChannelId: channelId,
    order: "time",
    maxResults: "50",
    textFormat: "plainText",
  });
  const comments = items.filter(
    (t) => t.snippet.videoId && t.snippet.topLevelComment.snippet.authorChannelId?.value !== channelId,
  );
  const videoIds = [...new Set(comments.map((t) => t.snippet.videoId!))];
  const about = new Map<string, string>();
  if (videoIds.length) {
    const { items: videos = [] } = await get<{ items?: { id: string; snippet: { title: string; description: string } }[] }>(
      token,
      "videos",
      { part: "snippet", id: videoIds.join(",") },
    );
    for (const v of videos) about.set(v.id, `${v.snippet.title}\n\n${v.snippet.description.slice(0, 500)}`.trim());
  }
  return comments.map((t) => {
    const c = t.snippet.topLevelComment;
    return {
      id: c.id,
      videoId: t.snippet.videoId!,
      author: c.snippet.authorDisplayName.replace(/^@/, ""),
      text: c.snippet.textDisplay,
      postedAt: c.snippet.publishedAt,
      postText: about.get(t.snippet.videoId!) ?? "",
    };
  });
}

/** Replies to a top-level comment and returns a link to the reply. */
export async function replyOnYouTube(token: string, comment: { id: string; videoId: string }, text: string): Promise<{ url: string }> {
  const res = await fetch(`${API}/comments?part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { parentId: comment.id, textOriginal: text } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const reply = await parse<{ id: string }>(res);
  return { url: `https://www.youtube.com/watch?v=${comment.videoId}&lc=${reply.id}` };
}
