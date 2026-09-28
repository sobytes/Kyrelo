import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pairingLink } from "./mobile-bridge";
import { getGrokSettings } from "./storage";
import { REPLY_MAX_LENGTH, tweetLength } from "./tweet";
import { REPLY_STYLES, REPLY_TONES } from "./types";

// The desktop side of contracts/: the iOS app's tests read the same files
// (mobile/ios/KyreloTests/ContractTests.swift).
const contract = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../contracts", name), "utf8"));

describe("contract: reply rules", () => {
  const rules = contract("reply-rules.json");

  it("uses the same reply limit, tones and styles", () => {
    expect(REPLY_MAX_LENGTH).toBe(rules.replyMaxLength);
    expect([...REPLY_TONES]).toEqual(rules.tones);
    expect([...REPLY_STYLES]).toEqual(rules.styles);
  });

  it.each(contract("reply-rules.json").lengthCases as { text: string; length: number }[])(
    "counts %j the same way",
    ({ text, length }) => {
      expect(tweetLength(text)).toBe(length);
    },
  );
});

describe("contract: pairing links", () => {
  it("produces links in the format the phone reads", () => {
    const valid = contract("pairing-links.json").valid[0];
    const ours = pairingLink("abc_DEF-123");
    expect(ours).toMatch(/^kyrelo:\/\/pair\?hosts=[^&]*&port=\d+&token=abc_DEF-123$/);
    // Same shape as the contract's example: hosts comma-joined, URL-encoded.
    const params = (link: string) => new URLSearchParams(link.split("?")[1]);
    expect([...params(ours).keys()]).toEqual([...params(valid.link).keys()]);
  });
});

/** Every key path in a JSON value, e.g. "autopilot.tone". Arrays use their items' keys. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((v) => keyPaths(v, prefix)))];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...keyPaths(v, `${prefix}${k}.`)]);
  }
  return [];
}

describe("contract: monitor feed sample", () => {
  const sample = contract("monitor-feed.json");

  it("has exactly the settings fields the desktop returns", async () => {
    const real = await getGrokSettings();
    expect(keyPaths(sample.settings).sort()).toEqual(keyPaths(real).sort());
  });

  it("uses only fields that SeenTweet and ReplyDraft define", () => {
    const known = [
      "id", "handle", "text", "url", "isReply", "seenAt", "postedAt", "repliedAt", "replyText",
      "replyError", "skipped", "draft", "draft.score", "draft.reason", "draft.options", "draft.generatedAt",
    ];
    for (const key of keyPaths(sample.state.tweets)) expect(known).toContain(key);
  });
});
