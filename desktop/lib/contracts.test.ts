import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pairingLink } from "./mobile-bridge";
import { PLATFORM_IDS, PLATFORMS, postImageError } from "./platforms";
import { getGrokSettings } from "./storage";
import { MAX_TWEET_LENGTH, REPLY_MAX_LENGTH, tweetLength } from "./tweet";
import { REPLY_STYLES, REPLY_TONES } from "./types";
import { MAX_IMAGE_BYTES } from "./uploads";

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

  it("never allows a bigger image than the upload route accepts", () => {
    for (const id of PLATFORM_IDS) expect(PLATFORMS[id].maxImageBytes).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
  });

  it("lists the same platforms, names, limits, links and how each connects", () => {
    expect(rules.platforms).toEqual(
      PLATFORM_IDS.map((id) => ({
        id,
        label: PLATFORMS[id].label,
        maxLength: PLATFORMS[id].maxLength,
        maxImageBytes: PLATFORMS[id].maxImageBytes,
        maxVideoBytes: PLATFORMS[id].maxVideoBytes,
        requiresImage: PLATFORMS[id].requiresImage,
        requiresVideo: PLATFORMS[id].requiresVideo,
        campaignLimit: PLATFORMS[id].campaignLimit,
        imageTypes: PLATFORMS[id].imageTypes,
        connect: PLATFORMS[id].connect,
        credentials: (PLATFORMS[id].credentials ?? []).map((f) => f.key),
        loginUrl: PLATFORMS[id].loginUrl,
        signupUrl: PLATFORMS[id].signupUrl,
      })),
    );
  });

  it.each(rules.imageCases as { platform: keyof typeof PLATFORMS; imagePath: string | null; error: string | null }[])(
    "says the same about $platform with $imagePath",
    ({ platform, imagePath, error }) => {
      expect(postImageError(platform, imagePath ?? undefined)).toBe(error);
    },
  );

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
      "id", "handle", "keyword", "text", "url", "isReply", "seenAt", "postedAt", "repliedAt", "replyText",
      "replyError", "skipped", "draft", "draft.score", "draft.reason", "draft.options", "draft.generatedAt",
    ];
    for (const key of keyPaths(sample.state.tweets)) expect(known).toContain(key);
  });
});

describe("contract: comments sample", () => {
  const sample = contract("comments.json");

  it("has exactly the settings fields the desktop returns", async () => {
    const { getCommentSettings } = await import("./storage");
    expect(keyPaths(sample.settings).sort()).toEqual(keyPaths(await getCommentSettings()).sort());
  });

  it("uses only fields PostComment and ReplyDraft define", () => {
    const known = [
      "id", "platform", "accountId", "author", "text", "url", "postedAt", "postText", "seenAt", "target",
      "draft", "draft.score", "draft.reason", "draft.options", "draft.generatedAt",
      "repliedAt", "replyText", "replyUrl", "replyError", "dismissedAt",
    ];
    for (const key of keyPaths(sample.comments.state.comments)) {
      if (!key.startsWith("target.")) expect(known).toContain(key);
    }
  });

  it("lists only platforms Comments supports", async () => {
    const { COMMENT_PLATFORMS } = await import("./comments");
    expect([...sample.comments.platforms].sort()).toEqual([...COMMENT_PLATFORMS].sort());
  });
});

describe("contract: media sample", () => {
  const sample = contract("media.json");

  it("uses only fields MediaItem and MediaBucket define", () => {
    const item = "id filename kind bytes posterFilename description bucketIds addedAt".split(" ");
    for (const key of keyPaths(sample.items)) expect(item).toContain(key);
    for (const key of keyPaths(sample.buckets)) expect(["id", "name", "createdAt"]).toContain(key);
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
    const fields = allowed(`id targets targets.platform targets.accountId accountId maxLength brief url competitors count windowMinutes useAiImages autoSchedule
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

describe("contract: design tokens", () => {
  it("the website builds from an identical copy", () => {
    // Vercel builds website/ on its own, so it keeps a copy of the tokens.
    const copy = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "website", "design-tokens.json"), "utf8"));
    expect(copy).toEqual(contract("design-tokens.json"));
  });

  it("the app window opens in the canvas colour", () => {
    const main = readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
    expect(main).toContain(`const CANVAS = "${contract("design-tokens.json").color.canvas}";`);
  });

  it("keeps every radius within 12px", () => {
    for (const r of Object.values(contract("design-tokens.json").radius as Record<string, number>)) {
      expect(r).toBeLessThanOrEqual(12);
    }
  });
});

describe("contract: services", () => {
  const sample = contract("services.json");

  it("has a service for every platform, and only those", async () => {
    const { SERVICES } = await import("./services");
    expect(SERVICES.map((s) => s.id).sort()).toEqual([...PLATFORM_IDS].sort());
    expect(new Set(SERVICES.map((s) => s.slug)).size).toBe(SERVICES.length);
  });

  it("keeps the Scheduler, Comments and Media global, not sections of a service", () => {
    expect(sample.global).toEqual(["scheduler", "comments", "media"]);
    expect(sample.sections).not.toContain("scheduler");
  });

  it("gives each service known sections, including a way to connect it", () => {
    for (const service of sample.services as { sections: string[]; label: string; id: string }[]) {
      for (const section of service.sections) expect(sample.sections).toContain(section);
      expect(service.sections).toContain("accounts");
      expect(service.label).toBe(PLATFORMS[service.id as keyof typeof PLATFORMS].label);
    }
  });
});

describe("contract: X tools sample (Deleter, Unfollow, finder)", () => {
  const sample = contract("x-tools.json");
  const allowed = (fields: string) => fields.split(/\s+/).filter(Boolean);
  const jobFields = "id kind accountId handle startedAt finishedAt running total done failed log error";

  it("uses only fields the Deleter job defines", () => {
    const fields = allowed("id accountId handle target count startingAt includeReposts startedAt finishedAt running deleted skipped log error");
    for (const key of keyPaths(sample.deleter.job)) expect(fields).toContain(key);
  });

  it("has the fields GET /api/unfollow returns for the phone", async () => {
    const route = await import("@/app/api/unfollow/route");
    const { NextRequest } = await import("next/server");
    const real = await (await route.GET(new NextRequest("http://127.0.0.1:3000/api/unfollow?accountId=none&rules=%7B%7D"))).json();
    expect(Object.keys(sample.unfollow).sort()).toEqual(Object.keys(real).sort());
    expect(Object.keys(sample.unfollow.rules).sort()).toEqual(Object.keys(real.rules).sort());
    const rowFields = allowed(
      "handle name followers following posts followsYou lastPostAt kept reasons protectedBecause needsActivityCheck",
    );
    for (const key of keyPaths(sample.unfollow.rows)) expect(rowFields).toContain(key);
    for (const key of keyPaths(sample.unfollow.job)) expect(allowed(jobFields)).toContain(key);
  });

  it("uses only fields a handle suggestion defines", () => {
    const fields = allowed(
      "handle name group reason fromX userId bio followers posts lastPostAt youFollow followedAt",
    );
    for (const key of keyPaths(sample.finder.data.suggestions)) expect(fields).toContain(key);
    expect(Object.keys(sample.finder).sort()).toEqual(["aiReady", "data", "job", "profile"]);
  });
});

describe("contract: service icons", () => {
  const sample = contract("service-icons.json");

  it("has an icon for every platform and global section", () => {
    expect(Object.keys(sample.icons).sort()).toEqual([...PLATFORM_IDS].sort());
    expect(Object.keys(sample.globals)).toEqual(contract("services.json").global);
  });

  it("the iPhone's copies are up to date (npm run service-icons)", async () => {
    const { iosIconFiles } = await import("../scripts/generate-service-icons.mjs");
    const all = [
      ...Object.entries(sample.icons as Record<string, string>).map(([id, m]) => [`Service-${id}`, id, m]),
      ...Object.entries(sample.globals as Record<string, string>).map(([id, m]) => [`Global-${id}`, id, m]),
    ];
    for (const [name, id, markup] of all) {
      const { dir, files } = iosIconFiles(name, id, markup, sample.viewBox);
      for (const [name, content] of Object.entries(files)) {
        // Git on Windows may check these out with CRLF line endings.
        const onDisk = readFileSync(path.join(dir, name), "utf8").replaceAll("\r\n", "\n");
        expect(onDisk, `${id}/${name}`).toBe(content);
      }
    }
  });
});
