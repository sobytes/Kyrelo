import { promises as fs } from "node:fs";
import path from "node:path";
import { imageTypeForFilename } from "./uploads";

// LinkedIn through its official API ("Share on LinkedIn"), which any
// developer app gets without review. The user makes an app, adds the
// "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect"
// products, and pastes a token from LinkedIn's token generator. LinkedIn
// doesn't renew these tokens for apps like this: they last 60 days, then the
// user makes a new one.

const API = "https://api.linkedin.com";
const TIMEOUT_MS = 30_000;
// LinkedIn's API is versioned by month; each version is supported for a year.
const VERSION = "202609";

export const LINKEDIN_EXPIRED = "LinkedIn tokens last 60 days. Make a new one in LinkedIn's token generator and reconnect under Accounts.";

async function api(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error(LINKEDIN_EXPIRED);
  // The API version Kyrelo asks for has been retired: Kyrelo needs updating.
  if (res.status === 426) throw new Error("LinkedIn no longer supports the API version this Kyrelo uses. Update Kyrelo.");
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`LinkedIn: ${json.message ?? `HTTP ${res.status}`}`);
  }
  return res;
}

/** Who the token belongs to: their member id (sub) and name. */
export async function verifyLinkedInToken(token: string): Promise<{ sub: string; name: string }> {
  const res = await api(`${API}/v2/userinfo`, token);
  return (await res.json()) as { sub: string; name: string };
}

/**
 * LinkedIn reads post text as "little text", where these characters are
 * markup; a literal one has to be escaped or the post is cut short or refused.
 */
export function escapeLittleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
}

async function uploadImage(token: string, owner: string, imagePath: string): Promise<string> {
  const init = await api(`${API}/rest/images?action=initializeUpload`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  const data = await fs.readFile(imagePath);
  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": imageTypeForFilename(path.basename(imagePath)) ?? "image/png" },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!put.ok) throw new Error(`LinkedIn: the image upload failed (HTTP ${put.status}).`);
  return value.image;
}

/** Posts `text` (and an optional image) publicly from the member and returns the post's URL. */
export async function postToLinkedIn(token: string, memberId: string, text: string, imagePath?: string): Promise<{ url: string }> {
  const author = `urn:li:person:${memberId}`;
  const image = imagePath ? await uploadImage(token, author, imagePath) : undefined;
  const res = await api(`${API}/rest/posts`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author,
      commentary: escapeLittleText(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(image ? { content: { media: { id: image } } } : {}),
    }),
  });
  // The new post's urn comes back in a header, not the body.
  const urn = res.headers.get("x-restli-id");
  return { url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : "https://www.linkedin.com/feed/" };
}
