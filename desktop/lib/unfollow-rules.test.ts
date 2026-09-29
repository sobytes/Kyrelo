import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  FollowedAccount,
  isSuggested,
  parseRules,
  protectionReason,
  UnfollowContext,
  UnfollowRules,
  unfollowReasons,
} from "./unfollow-rules";

const now = new Date("2026-06-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const active: FollowedAccount = {
  handle: "Friend",
  name: "Friend",
  bio: "Builds things",
  followers: 900,
  following: 400,
  posts: 3_000,
  createdAt: daysAgo(2_000),
  defaultAvatar: false,
  followsYou: true,
  lastPostAt: daysAgo(2),
};

const ctx: UnfollowContext = { keep: [], watched: [], interactions: {}, now };
const all: UnfollowRules = { ...DEFAULT_RULES, dead: true, neverEngage: true, bots: true, notFollowingBack: true };

describe("unfollow rules", () => {
  it("suggests nothing for an active account that follows back and interacts", () => {
    const withInteraction = { ...ctx, interactions: { friend: daysAgo(10) }, interactionsScannedAt: daysAgo(0) };
    expect(unfollowReasons(active, all, withInteraction)).toEqual([]);
  });

  it("finds dead accounts: inactive, never posted, or barely posts", () => {
    expect(unfollowReasons({ ...active, lastPostAt: daysAgo(240) }, DEFAULT_RULES, ctx)).toEqual(["no posts in 8 months"]);
    expect(unfollowReasons({ ...active, lastPostAt: daysAgo(100) }, DEFAULT_RULES, ctx)).toEqual([]);
    expect(unfollowReasons({ ...active, lastPostAt: null }, DEFAULT_RULES, ctx)).toEqual(["has never posted"]);
    // Not checked yet: judged by the post count alone.
    const unchecked = { ...active, lastPostAt: undefined };
    expect(unfollowReasons({ ...unchecked, posts: 3 }, DEFAULT_RULES, ctx)).toEqual(["only 3 posts"]);
    expect(unfollowReasons({ ...unchecked, posts: 12, createdAt: daysAgo(365 * 6) }, DEFAULT_RULES, ctx)).toEqual([
      "about 2 posts a year",
    ]);
  });

  it("uses the chosen number of inactive days", () => {
    const quiet = { ...active, lastPostAt: daysAgo(100) };
    expect(unfollowReasons(quiet, { ...DEFAULT_RULES, inactiveDays: 90 }, ctx)).toEqual(["no posts in 3 months"]);
  });

  it("finds bots and follow-for-follow accounts", () => {
    expect(unfollowReasons({ ...active, following: 4_000, followers: 200 }, DEFAULT_RULES, ctx)).toEqual([
      "follows 4,000, followed by 200",
    ]);
    expect(unfollowReasons({ ...active, following: 7_400, followers: 5_000 }, DEFAULT_RULES, ctx)).toEqual([
      "follows 7,400 accounts",
    ]);
    expect(unfollowReasons({ ...active, createdAt: daysAgo(12), posts: 50 }, DEFAULT_RULES, ctx)).toEqual([
      "account is 12 days old",
    ]);
    expect(unfollowReasons({ ...active, defaultAvatar: true, bio: " " }, DEFAULT_RULES, ctx)).toEqual(["no photo or bio"]);
    // A small account following a few hundred people is normal.
    expect(unfollowReasons({ ...active, following: 600, followers: 20 }, DEFAULT_RULES, ctx)).toEqual([]);
  });

  it("only judges engagement once interactions were scanned", () => {
    const rules = { ...DEFAULT_RULES, neverEngage: true };
    expect(unfollowReasons(active, rules, ctx)).toEqual([]);
    const scanned = { ...ctx, interactionsScannedAt: daysAgo(0) };
    expect(unfollowReasons(active, rules, scanned)).toEqual(["never interacts with you"]);
    // Interactions older than the window don't count.
    const stale = { ...scanned, interactions: { friend: daysAgo(120) } };
    expect(unfollowReasons(active, rules, stale)).toEqual(["never interacts with you"]);
  });

  it("finds accounts that don't follow back, only when asked", () => {
    const notBack = { ...active, followsYou: false };
    expect(unfollowReasons(notBack, DEFAULT_RULES, ctx)).toEqual([]);
    expect(unfollowReasons(notBack, { ...DEFAULT_RULES, notFollowingBack: true }, ctx)).toEqual(["doesn't follow you"]);
  });

  it("lists every rule an account breaks", () => {
    const ghost = { ...active, followsYou: false, lastPostAt: null, defaultAvatar: true, bio: "" };
    expect(unfollowReasons(ghost, all, { ...ctx, interactionsScannedAt: daysAgo(0) })).toEqual([
      "has never posted",
      "never interacts with you",
      "no photo or bio",
      "doesn't follow you",
    ]);
  });

  it("stats X didn't give are never held against an account", () => {
    const bare: FollowedAccount = { handle: "someone", name: "Someone", followsYou: true };
    expect(unfollowReasons(bare, all, ctx)).toEqual([]);
  });

  it("protects the keep list, Monitor handles, people who interact, and big accounts", () => {
    const dead = { ...active, lastPostAt: null };
    expect(protectionReason(dead, DEFAULT_RULES, { ...ctx, keep: ["friend"] })).toBe("on your keep list");
    expect(protectionReason(dead, DEFAULT_RULES, { ...ctx, watched: ["friend"] })).toBe("watched in Monitor");
    expect(protectionReason(dead, DEFAULT_RULES, { ...ctx, interactions: { friend: daysAgo(5) } })).toBe("interacts with you");
    const big = { ...dead, followers: 80_000 };
    expect(protectionReason(big, DEFAULT_RULES, ctx)).toBe("big account");
    expect(protectionReason(big, { ...DEFAULT_RULES, protectBig: false }, ctx)).toBeNull();

    expect(isSuggested(dead, DEFAULT_RULES, ctx)).toBe(true);
    expect(isSuggested(dead, DEFAULT_RULES, { ...ctx, keep: ["friend"] })).toBe(false);
  });

  it("reads rules from a request, keeping only valid values", () => {
    expect(parseRules(undefined)).toEqual(DEFAULT_RULES);
    expect(parseRules({ bots: false, inactiveDays: 5, extra: 1, dead: "yes" })).toEqual({
      ...DEFAULT_RULES,
      bots: false,
      inactiveDays: 30,
    });
    expect(parseRules({ inactiveDays: 99_999 }).inactiveDays).toBe(3 * 365);
  });
});
