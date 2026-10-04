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
