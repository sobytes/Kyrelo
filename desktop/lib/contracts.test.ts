import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pairingLink } from "./mobile-bridge";
import { PLATFORM_IDS, PLATFORMS } from "./platforms";
import { getGrokSettings } from "./storage";
import { MAX_TWEET_LENGTH, REPLY_MAX_LENGTH, tweetLength } from "./tweet";
import { REPLY_STYLES, REPLY_TONES } from "./types";

// The desktop side of contracts/: the iOS app's tests read the same files
// (mobile/ios/KyreloTests/ContractTests.swift).
const contract = (name: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../contracts", name), "utf8"));

describe("contract: reply rules", () => {
  const rules = contract("reply-rules.json");

  it("uses the same reply limit, tones and styles", () => {
    expect(REPLY_MAX_LENGTH).toBe(rules.replyMaxLength);
    expect(MAX_TWEET_LENGTH).toBe(rules.campaignMaxLength);
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

describe("contract: platform rules", () => {
  const rules = contract("platform-rules.json");

  it("lists the same platforms, names and limits", () => {
    expect(rules.platforms).toEqual(
      PLATFORM_IDS.map((id) => ({ id, label: PLATFORMS[id].label, maxLength: PLATFORMS[id].maxLength })),
    );
  });

  it.each(rules.lengthCases as { platform: keyof typeof PLATFORMS; text: string; length: number }[])(
    "counts $platform %j the same way",
    ({ platform, text, length }) => {
      expect(PLATFORMS[platform].length(text)).toBe(length);
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

describe("contract: scheduler sample", () => {
  const sample = contract("scheduler.json");
  // Every field the desktop types define (lib/types.ts). The sample may leave
  // optional ones out, but must not invent any.
  const allowed = (fields: string) => fields.split(/\s+/).filter(Boolean);

  it("uses only fields Account defines", () => {
    for (const key of keyPaths(sample.accounts)) expect(allowed("platform id handle addedAt")).toContain(key);
  });

  it("uses only fields ScheduledPost defines", () => {
    const fields = allowed(`id platform accountId text imagePath scheduledFor createdAt status
      sendingStartedAt postedAt postedUrl error campaignId`);
    for (const key of keyPaths(sample.posts)) expect(fields).toContain(key);
  });

  it("uses only fields Campaign and CampaignDraft define", () => {
    const fields = allowed(`id accountId brief url competitors count windowMinutes useAiImages autoSchedule
      provider status progress research drafts postIds error createdAt
      drafts.id drafts.angle drafts.text drafts.media drafts.media.kind drafts.media.imagePath drafts.media.note
      drafts.sources drafts.scheduledFor`);
    for (const key of keyPaths(sample.campaignsInfo.campaigns)) expect(fields).toContain(key);
  });

  it("has the fields GET /api/campaigns and /api/brand-profile return", async () => {
    const campaigns = await import("@/app/api/campaigns/route");
    const real = await (await campaigns.GET()).json();
    expect(Object.keys(sample.campaignsInfo).sort()).toEqual(Object.keys(real).sort());
    const { getBrandProfile } = await import("./storage");
    expect(Object.keys(sample.brandProfile).sort()).toEqual(Object.keys(await getBrandProfile()).sort());
  });
});
