import { promises as fs } from "node:fs";
import path from "node:path";
import { PLATFORMS } from "./platforms";
import { imageTypeForFilename } from "./uploads";

// Bluesky through its public XRPC API, authenticated with an app password
// (Settings → Privacy and security → App passwords). No browser needed.

// The entryway for accounts hosted by Bluesky. Self-hosted PDS accounts aren't
// supported yet.
const SERVICE = "https://bsky.social";
const TIMEOUT_MS = 30_000;

interface Session {
  did: string;
  handle: string;
  accessJwt: string;
}

async function xrpc<T>(method: string, body: BodyInit, headers: Record<string, string>): Promise<T> {
  const res = await fetch(`${SERVICE}/xrpc/${method}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(`Bluesky: ${json.message ?? json.error ?? `HTTP ${res.status}`}`);
  return json;
}

/** Signs in with a handle (or email) and app password. Throws with Bluesky's reason if refused. */
export async function createSession(identifier: string, appPassword: string): Promise<Session> {
  return xrpc<Session>(
    "com.atproto.server.createSession",
    JSON.stringify({ identifier: identifier.replace(/^@/, ""), password: appPassword }),
    { "Content-Type": "application/json" },
  );
}

interface LinkFacet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#link"; uri: string }[];
}

const URL_RE = /https?:\/\/[^\s]+[^\s.,;:!?)"'\]]/g;

/**
 * Bluesky only makes links clickable when the post says where they are, as
 * UTF-8 byte offsets (not character offsets: emoji and accents take several
 * bytes).
 */
export function linkFacets(text: string): LinkFacet[] {
  const facets: LinkFacet[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const byteStart = Buffer.byteLength(text.slice(0, m.index));
    facets.push({
      index: { byteStart, byteEnd: byteStart + Buffer.byteLength(m[0]) },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  return facets;
}

/** Posts `text` (and an optional image) and returns the post's bsky.app URL. */
export async function postToBluesky(
  identifier: string,
  appPassword: string,
  text: string,
  imagePath?: string,
): Promise<{ url: string }> {
  const session = await createSession(identifier, appPassword);
  const auth = { Authorization: `Bearer ${session.accessJwt}` };

  let embed: object | undefined;
  if (imagePath) {
    const data = await fs.readFile(imagePath);
    if (data.length > PLATFORMS.bluesky.maxImageBytes) {
      throw new Error("Bluesky only accepts images up to 1 MB. Attach a smaller image.");
    }
    const mimeType = imageTypeForFilename(path.basename(imagePath)) ?? "image/png";
    const { blob } = await xrpc<{ blob: unknown }>("com.atproto.repo.uploadBlob", new Uint8Array(data), {
      ...auth,
      "Content-Type": mimeType,
    });
    embed = { $type: "app.bsky.embed.images", images: [{ alt: "", image: blob }] };
  }

  const facets = linkFacets(text);
  const { uri } = await xrpc<{ uri: string }>(
    "com.atproto.repo.createRecord",
    JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
        ...(facets.length ? { facets } : {}),
        ...(embed ? { embed } : {}),
      },
    }),
    { ...auth, "Content-Type": "application/json" },
  );
  // at://did:plc:…/app.bsky.feed.post/<rkey>
  const rkey = uri.split("/").pop();
  return { url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}
