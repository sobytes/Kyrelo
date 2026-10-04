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

/** A signed note (NIP-01): the id is the SHA-256 of the serialized event, signed with Schnorr. */
export function signNote(secretKey: Uint8Array, content: string, createdAt = Math.floor(Date.now() / 1000)): NostrEvent {
  const pubkey = publicKeyHex(secretKey);
  const unsigned = { pubkey, created_at: createdAt, kind: 1, tags: [] as string[][], content };
  const id = sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, createdAt, 1, unsigned.tags, content])));
  return { ...unsigned, id: hex.encode(id), sig: hex.encode(schnorr.sign(id, secretKey)) };
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

/** Signs and publishes a note to the relays; returns its link once at least one relay has it. */
export async function postToNostr(secretKey: Uint8Array, text: string, relays = DEFAULT_RELAYS): Promise<{ url: string }> {
  const event = signNote(secretKey, text);
  const results = await Promise.all(relays.map((r) => sendToRelay(r, event)));
  if (!results.some(Boolean)) throw new Error("Nostr: no relay accepted the note. Check your connection and try again.");
  return { url: `https://njump.me/${bech32.encode("note", bech32.toWords(hex.decode(event.id)))}` };
}
