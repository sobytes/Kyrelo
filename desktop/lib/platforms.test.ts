import { describe, expect, it } from "vitest";
import { fitText, isPlatformId, PLATFORMS, postTextError } from "./platforms";

describe("platform rules", () => {
  it("counts length the way each platform does", () => {
    const withLink = "hi https://example.com/a/very/long/path/that/goes/on/and/on";
    expect(PLATFORMS.twitter.length(withLink)).toBe(3 + 23); // X: links count 23
    expect(PLATFORMS.bluesky.length(withLink)).toBe(withLink.length); // Bluesky: in full
    // Bluesky counts what a person sees: a family emoji is one character.
    expect(PLATFORMS.bluesky.length("👨‍👩‍👧")).toBe(1);
  });

  it("explains why text can't be posted", () => {
    expect(postTextError("bluesky", "  ")).toMatch(/empty/);
    expect(postTextError("bluesky", "x".repeat(301))).toMatch(/Bluesky.*300/);
    expect(postTextError("linkedin", "x".repeat(3000))).toBeNull();
    expect(postTextError("linkedin", "x".repeat(3001))).toMatch(/LinkedIn/);
  });

  it("recognises platform ids", () => {
    expect(isPlatformId("bluesky")).toBe(true);
    expect(isPlatformId("mastodon")).toBe(false);
    expect(isPlatformId(undefined)).toBe(false);
  });
});

describe("fitText", () => {
  const plain = (t: string) => t.length;

  it("leaves text that fits alone", () => {
    expect(fitText("short post", 280, plain)).toBe("short post");
  });

  it("drops whole words from the end, keeps links, and marks the cut", () => {
    const text = "one two three four five six https://kyrelo.com";
    const out = fitText(text, 36, plain);
    expect(out.length).toBeLessThanOrEqual(36);
    expect(out).toContain("https://kyrelo.com");
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\bthr\b/); // no half words
  });
});
