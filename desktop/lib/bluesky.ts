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
  return parse<T>(res);
}

async function xrpcGet<T>(method: string, params: URLSearchParams, accessJwt: string): Promise<T> {
  const res = await fetch(`${SERVICE}/xrpc/${method}?${params}`, {
    headers: { Authorization: `Bearer ${accessJwt}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  // `cause` keeps Bluesky's error code ("ExpiredToken") for withSession.
  if (!res.ok) throw new Error(`Bluesky: ${json.message ?? json.error ?? `HTTP ${res.status}`}`, { cause: json.error });
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

// Comments are checked every few minutes, and Bluesky allows only so many
// sign-ins (createSession) per account per day, so the session is kept here
// and only renewed when Bluesky says it has expired (after about two hours).
const sessions = ((globalThis as { __kyreloBlueskySessions?: Map<string, Session> }).__kyreloBlueskySessions ??= new Map());

async function withSession<T>(identifier: string, appPassword: string, run: (session: Session) => Promise<T>): Promise<T> {
  let session = sessions.get(identifier);
  if (session) {
    try {
      return await run(session);
    } catch (err) {
      if ((err as Error).cause !== "ExpiredToken") throw err;
    }
  }
  session = await createSession(identifier, appPassword);
  sessions.set(identifier, session);
  return run(session);
}

/** A reply someone left on one of your posts. */
export interface BlueskyComment {
  uri: string;
  cid: string;
  /** The thread's first post, which a reply to this comment must name too. */
  root: { uri: string; cid: string };
  author: string;
  text: string;
  url: string;
  postedAt: string;
  /** Your post it replies to. */
  postText: string;
}

interface Notification {
  uri: string;
  cid: string;
  author: { did: string; handle: string };
  reason: string;
  reasonSubject?: string;
  record: { text?: string; createdAt?: string; reply?: { root: { uri: string; cid: string } } };
  indexedAt: string;
}

function postUrl(handle: string, uri: string): string {
  // at://did:plc:…/app.bsky.feed.post/<rkey>
  return `https://bsky.app/profile/${handle}/post/${uri.split("/").pop()}`;
}

/** The newest replies to your posts, from your notifications. */
export async function listBlueskyComments(identifier: string, appPassword: string): Promise<BlueskyComment[]> {
  return withSession(identifier, appPassword, async (session) => {
    const { notifications } = await xrpcGet<{ notifications: Notification[] }>(
      "app.bsky.notification.listNotifications",
      new URLSearchParams({ limit: "50" }),
      session.accessJwt,
    );
    const replies = notifications.filter(
      (n) => n.reason === "reply" && n.reasonSubject && n.record.reply && n.author.did !== session.did,
    );
    // Your posts' text, for the AI. getPosts takes 25 at a time; 50
    // notifications rarely reply to more than a few posts.
    const parentUris = Array.from(new Set(replies.map((n) => n.reasonSubject!))).slice(0, 25);
    const parents = new Map<string, string>();
    if (parentUris.length) {
      const params = new URLSearchParams();
      for (const uri of parentUris) params.append("uris", uri);
      const { posts } = await xrpcGet<{ posts: { uri: string; record: { text?: string } }[] }>(
        "app.bsky.feed.getPosts",
        params,
        session.accessJwt,
      );
      for (const p of posts) parents.set(p.uri, p.record.text ?? "");
    }
    return replies
      .filter((n) => parents.has(n.reasonSubject!))
      .map((n) => ({
        uri: n.uri,
        cid: n.cid,
        root: n.record.reply!.root,
        author: n.author.handle,
        text: n.record.text ?? "",
        url: postUrl(n.author.handle, n.uri),
        postedAt: n.record.createdAt ?? n.indexedAt,
        postText: parents.get(n.reasonSubject!)!,
      }));
  });
}

/** Replies to a comment, in its thread, and returns the reply's URL. */
export async function replyOnBluesky(
  identifier: string,
  appPassword: string,
  comment: Pick<BlueskyComment, "uri" | "cid" | "root">,
  text: string,
): Promise<{ url: string }> {
  return withSession(identifier, appPassword, async (session) => {
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
          reply: { root: comment.root, parent: { uri: comment.uri, cid: comment.cid } },
          ...(facets.length ? { facets } : {}),
        },
      }),
      { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" },
    );
    return { url: postUrl(session.handle, uri) };
  });
}
