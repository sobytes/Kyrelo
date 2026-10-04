import { schnorr } from "@noble/curves/secp256k1.js";
import { bech32, hex } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { npub, parseSecretKey, postToNostr, publicKeyHex, signNote } from "./nostr";

afterEach(() => vi.unstubAllGlobals());

// A throwaway key made for the test, never a real one.
const secret = schnorr.utils.randomSecretKey();
const nsec = bech32.encode("nsec", bech32.toWords(secret));

describe("Nostr", () => {
  it("reads a secret key as nsec or hex, and refuses anything else", () => {
    expect(parseSecretKey(nsec)).toEqual(secret);
    expect(parseSecretKey(hex.encode(secret))).toEqual(secret);
    expect(() => parseSecretKey(npub(publicKeyHex(secret)))).toThrow(/nsec1/);
    expect(() => parseSecretKey("hello")).toThrow(/nsec1/);
  });

  it("signs notes that verify against the public key", () => {
    const event = signNote(secret, "hello nostr", 1_700_000_000);
    expect(event).toMatchObject({ kind: 1, created_at: 1_700_000_000, content: "hello nostr", pubkey: publicKeyHex(secret) });
    expect(schnorr.verify(hex.decode(event.sig), hex.decode(event.id), hex.decode(event.pubkey))).toBe(true);
  });

  it("succeeds when one relay accepts the note, and fails when none do", async () => {
    class FakeRelay {
      onopen?: () => void;
      onmessage?: (m: { data: string }) => void;
      onerror?: () => void;
      constructor(readonly url: string) {
        setTimeout(() => this.onopen?.(), 0);
      }
      send(data: string) {
        const [, event] = JSON.parse(data);
        // Only the first relay takes it.
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", event.id, this.url === "wss://a", ""]) }), 0);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeRelay);
    const { url } = await postToNostr(secret, "hi", ["wss://a", "wss://b"]);
    expect(url).toMatch(/^https:\/\/njump\.me\/note1/);
    await expect(postToNostr(secret, "hi", ["wss://b"])).rejects.toThrow(/no relay accepted/);
  });
});

describe("Nostr comments", () => {
  it("keeps signed replies to your own notes, and threads the answer (NIP-10)", async () => {
    const { listNostrComments, replyOnNostr } = await import("./nostr");
    const fan = schnorr.utils.randomSecretKey();
    const mine = signNote(secret, "my note", 1_759_500_000);
    const reply = signNote(fan, "great note", Math.floor(Date.now() / 1000) - 60, [
      ["e", mine.id, "", "root"],
      ["p", publicKeyHex(secret)],
    ]);
    const forged = { ...signNote(fan, "forged", Math.floor(Date.now() / 1000), [["e", mine.id, "", "root"]]), content: "changed" };
    const elsewhere = signNote(fan, "in someone else's thread", Math.floor(Date.now() / 1000), [["e", "ab".repeat(32), "", "root"]]);
    const sent: unknown[] = [];
    class FakeRelay {
      onopen?: () => void;
      onmessage?: (m: { data: string }) => void;
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      send(data: string) {
        const msg = JSON.parse(data);
        const reply_ = (m: unknown[]) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }), 0);
        if (msg[0] === "EVENT") {
          sent.push(msg[1]);
          return reply_(["OK", msg[1].id, true, ""]);
        }
        const events = msg[2].ids ? [mine] : [reply, forged, elsewhere];
        for (const e of events) reply_(["EVENT", msg[1], e]);
        reply_(["EOSE", msg[1]]);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeRelay);
    const comments = await listNostrComments(secret, ["wss://a"]);
    expect(comments.map((c) => [c.id, c.text, c.postText, c.rootId])).toEqual([[reply.id, "great note", "my note", mine.id]]);

    await replyOnNostr(secret, comments[0], "thanks!", ["wss://a"]);
    expect((sent[0] as { tags: string[][] }).tags).toEqual([
      ["e", mine.id, "", "root"],
      ["e", reply.id, "", "reply"],
      ["p", publicKeyHex(fan)],
    ]);
  });
});
