import { describe, expect, it } from "vitest";
import { keywordQuery, matchedKeyword, MAX_KEYWORDS, normalizeKeywords, searchTerm } from "./keywords";

describe("keywords", () => {
  it("cleans the list: trims, drops blanks, duplicates and overlong ones, caps it", () => {
    expect(normalizeKeywords(["  buffer  alternative ", "Buffer Alternative", "", "x".repeat(61), "kyrelo"])).toEqual([
      "buffer alternative",
      "kyrelo",
    ]);
    expect(normalizeKeywords(Array.from({ length: 20 }, (_, i) => `k${i}`))).toHaveLength(MAX_KEYWORDS);
    expect(normalizeKeywords("kyrelo")).toEqual([]);
  });

  it("quotes plain phrases and leaves X search syntax alone", () => {
    expect(searchTerm("kyrelo")).toBe("kyrelo");
    expect(searchTerm("buffer alternative")).toBe('"buffer alternative"');
    for (const syntax of ['"exact phrase"', "#buildinpublic", "$TSLA", "@buffer", "scheduler -crypto", "lang:en scheduler", "buffer OR hypefury"]) {
      expect(searchTerm(syntax)).toBe(syntax);
    }
  });

  it("builds one search for a group, without reposts or the user's own posts", () => {
    expect(keywordQuery(["kyrelo", "buffer alternative"], { includeReplies: false, exclude: ["kyreloapp"] })).toBe(
      '(kyrelo OR "buffer alternative") -filter:retweets -filter:replies -from:kyreloapp',
    );
    expect(keywordQuery(["kyrelo"], { includeReplies: true, exclude: [] })).toBe("kyrelo -filter:retweets");
  });

  it("labels a post with the keyword its text mentions", () => {
    const keywords = ["kyrelo", "buffer alternative", "#buildinpublic", "hypefury OR typefully", "scheduler -crypto lang:en"];
    expect(matchedKeyword("Looking for a Buffer alternative that's free", keywords)).toBe("buffer alternative");
    expect(matchedKeyword("Day 12 #BuildInPublic", keywords)).toBe("#buildinpublic");
    expect(matchedKeyword("Switched from Typefully last week", keywords)).toBe("hypefury OR typefully");
    expect(matchedKeyword("Which scheduler do you use?", keywords)).toBe("scheduler -crypto lang:en");
  });

  it("leaves out posts that only matched on something else, like the author's name", () => {
    // Seen live: a search for "kyrelo" returned every post by @YsucKyrelo.
    expect(matchedKeyword("So make I tell you congratulations na?", ["kyrelo", "buffer alternative"])).toBeUndefined();
    // One word of a phrase isn't a mention of it.
    expect(matchedKeyword("An alternative to spreadsheets", ["buffer alternative"])).toBeUndefined();
  });
});
