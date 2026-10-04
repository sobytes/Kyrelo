import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bech32, hex } from "@scure/base";

// Nostr: a post is a note (kind 1) signed with the user's own key and sent to
// public relays over WebSocket. The key (nsec) is the account: Kyrelo keeps
// it only on this computer. Text only, as images on Nostr are links to files
// hosted elsewhere.

/** Popular free relays, so a note reaches people without any setup. */
export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.nostr.band"];
const RELAY_TIMEOUT_MS = 10_000;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** The secret key from an nsec1… string or 64 hex characters. */
export function parseSecretKey(input: string): Uint8Array {
  const s = input.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return hex.decode(s.toLowerCase());
  try {
    const { prefix, bytes } = bech32.decodeToBytes(s as `${string}1${string}`);
    if (prefix === "nsec" && bytes.length === 32) return bytes;
  } catch {
    // fall through
  }
  throw new Error("That isn't a Nostr secret key. It starts with nsec1.");
}

export function publicKeyHex(secretKey: Uint8Array): string {
  return hex.encode(schnorr.getPublicKey(secretKey));
}

export function npub(pubkeyHex: string): string {
  return bech32.encode("npub", bech32.toWords(hex.decode(pubkeyHex)));
}

function eventId(e: Pick<NostrEvent, "pubkey" | "created_at" | "kind" | "tags" | "content">): Uint8Array {
  return sha256(new TextEncoder().encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])));
}

/** A signed note (NIP-01): the id is the SHA-256 of the serialized event, signed with Schnorr. */
export function signNote(
  secretKey: Uint8Array,
  content: string,
  createdAt = Math.floor(Date.now() / 1000),
  tags: string[][] = [],
): NostrEvent {
  const unsigned = { pubkey: publicKeyHex(secretKey), created_at: createdAt, kind: 1, tags, content };
  const id = eventId(unsigned);
  return { ...unsigned, id: hex.encode(id), sig: hex.encode(schnorr.sign(id, secretKey)) };
}

/** Whether an event from a relay is what it says: its id matches its content and the author signed it. */
export function isValidEvent(e: NostrEvent): boolean {
  try {
    return hex.encode(eventId(e)) === e.id && schnorr.verify(hex.decode(e.sig), hex.decode(e.id), hex.decode(e.pubkey));
  } catch {
    return false;
  }
}

/** Sends the event to one relay; resolves with whether it accepted it. */
function sendToRelay(relay: string, event: NostrEvent): Promise<boolean> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    const done = (ok: boolean) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), RELAY_TIMEOUT_MS);
    try {
      ws = new WebSocket(relay);
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify(["EVENT", event]));
    ws.onerror = () => done(false);
    ws.onmessage = (msg) => {
      try {
        const [type, id, ok] = JSON.parse(String(msg.data));
        if (type === "OK" && id === event.id) done(ok === true);
      } catch {
        // not for us
      }
    };
  });
}

/** The events one relay has for a filter, until it says it has sent them all (EOSE) or times out. */
function queryRelay(relay: string, filter: object): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const events: NostrEvent[] = [];
    const sub = "kyrelo";
    let ws: WebSocket;
    const done = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed
      }
      resolve(events);
    };
    const timer = setTimeout(done, RELAY_TIMEOUT_MS);
    try {
      ws = new WebSocket(relay);
    } catch {
      clearTimeout(timer);
      resolve(events);
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify(["REQ", sub, filter]));
    ws.onerror = done;
    ws.onmessage = (msg) => {
      try {
        const [type, id, event] = JSON.parse(String(msg.data));
        if (type === "EVENT" && id === sub) events.push(event);
        if (type === "EOSE" && id === sub) done();
      } catch {
        // not for us
      }
    };
  });
}

/** The matching events from all relays, each once, keeping only correctly signed ones (relays can't be trusted). */
export async function queryRelays(filter: object, relays = DEFAULT_RELAYS): Promise<NostrEvent[]> {
  const byId = new Map<string, NostrEvent>();
  for (const e of (await Promise.all(relays.map((r) => queryRelay(r, filter)))).flat()) {
    if (!byId.has(e.id) && isValidEvent(e)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

const noteLink = (id: string) => `https://njump.me/${bech32.encode("note", bech32.toWords(hex.decode(id)))}`;

/** A reply to one of your notes. */
export interface NostrComment {
  id: string;
  /** The thread's first note, which a reply names as its root (NIP-10). */
  rootId: string;
  authorPubkey: string;
  author: string;
  text: string;
  url: string;
  postedAt: string;
  postText: string;
}

/** The note an event replies to: its "reply" e-tag, or the last e-tag in older clients' style (NIP-10). */
function repliedTo(e: NostrEvent): { parent?: string; root?: string } {
  const eTags = e.tags.filter((t) => t[0] === "e" && t[1]);
  const marked = (m: string) => eTags.find((t) => t[3] === m)?.[1];
  const parent = marked("reply") ?? marked("root") ?? eTags.at(-1)?.[1];
  return { parent, root: marked("root") ?? eTags[0]?.[1] ?? parent };
}

/** Replies to your notes from the last two days. */
export async function listNostrComments(secretKey: Uint8Array, relays = DEFAULT_RELAYS): Promise<NostrComment[]> {
  const me = publicKeyHex(secretKey);
  const since = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
  const mentions = (await queryRelays({ kinds: [1], "#p": [me], since, limit: 100 }, relays)).filter((e) => e.pubkey !== me);
  const parentIds = [...new Set(mentions.map((e) => repliedTo(e).parent).filter((id): id is string => Boolean(id)))];
  const parents = new Map(
    parentIds.length ? (await queryRelays({ ids: parentIds }, relays)).map((e) => [e.id, e] as const) : [],
  );
  const out: NostrComment[] = [];
  for (const e of mentions) {
    const { parent, root } = repliedTo(e);
    const note = parent ? parents.get(parent) : undefined;
    // Only replies to the user's own notes, not mentions in other people's threads.
    if (!note || note.pubkey !== me) continue;
    out.push({
      id: e.id,
      rootId: root ?? note.id,
      authorPubkey: e.pubkey,
      author: `${npub(e.pubkey).slice(0, 12)}…`,
      text: e.content,
      url: noteLink(e.id),
      postedAt: new Date(e.created_at * 1000).toISOString(),
      postText: note.content,
    });
  }
  return out;
}

/** Replies in the comment's thread, naming its root and the comment (NIP-10) and tagging its author. */
export async function replyOnNostr(
  secretKey: Uint8Array,
  comment: { id: string; rootId: string; authorPubkey: string },
  text: string,
  relays = DEFAULT_RELAYS,
): Promise<{ url: string }> {
  const tags = [
    ["e", comment.rootId, "", "root"],
    ["e", comment.id, "", "reply"],
    ["p", comment.authorPubkey],
  ];
  return publish(signNote(secretKey, text, undefined, tags), relays);
}

/** Signs and publishes a note to the relays; returns its link once at least one relay has it. */
export async function postToNostr(secretKey: Uint8Array, text: string, relays = DEFAULT_RELAYS): Promise<{ url: string }> {
  return publish(signNote(secretKey, text), relays);
}

async function publish(event: NostrEvent, relays: string[]): Promise<{ url: string }> {
  const results = await Promise.all(relays.map((r) => sendToRelay(r, event)));
  if (!results.some(Boolean)) throw new Error("Nostr: no relay accepted the note. Check your connection and try again.");
  return { url: noteLink(event.id) };
}
