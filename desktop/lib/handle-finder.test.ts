import { describe, expect, it } from "vitest";
import { checkSuggestion, MAX_SUGGESTIONS, parseSuggestions, rankSuggestions } from "./handle-finder";
import { HandleSuggestion } from "./types";

const now = new Date("2026-09-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("parsing the AI's suggestions", () => {
  it("normalises handles and drops invalid, duplicate and excluded ones", () => {
    const raw = JSON.stringify({
      suggestions: [
        { handle: "@IndieHackers", group: "audience", reason: "Where founders hang out" },
        { handle: "https://x.com/levelsio/status/1", group: "peer", reason: "Builds in public" },
        { handle: "twitter.com/TechCrunch", group: "news", reason: "Covers launches" },
        { handle: "indiehackers", group: "audience", reason: "duplicate, other case" },
        { handle: "not a handle", group: "news", reason: "spaces" },
        { handle: "waytoolonghandlename", group: "news", reason: "over 15 characters" },
        { handle: "watchedone", group: "news", reason: "already watched" },
        { handle: "brand", group: "peer", reason: "the user's own account" },
        { handle: "mystery", group: "friends", reason: "unknown group" },
      ],
    });
    expect(parseSuggestions(raw, ["WatchedOne", "brand"])).toEqual([
      { handle: "IndieHackers", group: "audience", reason: "Where founders hang out" },
      { handle: "levelsio", group: "peer", reason: "Builds in public" },
      { handle: "TechCrunch", group: "news", reason: "Covers launches" },
    ]);
  });

  it(`keeps at most ${MAX_SUGGESTIONS}`, () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ handle: `acct${i}`, group: "peer", reason: "" }));
    expect(parseSuggestions(JSON.stringify({ suggestions: many }), [])).toHaveLength(MAX_SUGGESTIONS);
  });

  it("says so when the JSON is unreadable", () => {
    expect(() => parseSuggestions("not json", [])).toThrow(/unreadable/);
    expect(parseSuggestions("{}", [])).toEqual([]);
  });
});

describe("checking a suggestion on X", () => {
  const s = { handle: "someone", group: "audience" as const, reason: "Relevant" };
  const user = { id: "42", handle: "SomeOne", name: "Some One", followsYou: false, followers: 12_000, posts: 900, youFollow: true };

  it("keeps real, active accounts with X's spelling and stats", () => {
    const result = checkSuggestion(s, { user, lastPostAt: daysAgo(3), missing: false }, true, now);
    expect(result).toEqual({
      keep: {
        handle: "SomeOne",
        name: "Some One",
        group: "audience",
        reason: "Relevant",
        fromX: true,
        userId: "42",
        bio: undefined,
        followers: 12_000,
        posts: 900,
        lastPostAt: daysAgo(3),
        youFollow: true,
      },
    });
  });

  it("keeps an account whose last post couldn't be read", () => {
    expect("keep" in checkSuggestion(s, { user, lastPostAt: undefined, missing: false }, false, now)).toBe(true);
  });

  it("drops invented, dead and quiet accounts, saying why", () => {
    expect(checkSuggestion(s, { lastPostAt: undefined, missing: true }, false, now)).toEqual({
      drop: "doesn't exist on X or is suspended",
    });
    expect(checkSuggestion(s, { lastPostAt: undefined, missing: false }, false, now)).toEqual({ drop: "profile didn't load" });
    expect(checkSuggestion(s, { user, lastPostAt: null, missing: false }, false, now)).toEqual({ drop: "has never posted" });
    expect(checkSuggestion(s, { user, lastPostAt: daysAgo(90), missing: false }, false, now)).toEqual({
      drop: "no posts in 90 days",
    });
  });
});

describe("ranking suggestions", () => {
  it("groups them in order, biggest first", () => {
    const make = (handle: string, group: HandleSuggestion["group"], followers?: number): HandleSuggestion => ({
      handle,
      name: handle,
      group,
      reason: "",
      fromX: false,
      followers,
      youFollow: false,
    });
    const ranked = rankSuggestions([
      make("paper", "news", 900_000),
      make("small", "audience", 5_000),
      make("rival", "competitor", 20_000),
      make("big", "audience", 80_000),
      make("unknown", "audience"),
    ]);
    expect(ranked.map((s) => s.handle)).toEqual(["big", "small", "unknown", "rival", "paper"]);
  });
});
