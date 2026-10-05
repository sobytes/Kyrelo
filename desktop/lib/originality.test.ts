import { describe, expect, it } from "vitest";
import { findRepeat, similarity } from "./originality";

describe("originality", () => {
  const earlier = "Tired of paying for Buffer? Kyrelo schedules to 17 platforms for free, from your own computer. https://kyrelo.com";

  it("catches a rerun with small changes, and the same opening", () => {
    expect(similarity(earlier, "Tired of paying for Buffer? Kyrelo schedules to all 17 platforms for free, right from your computer.")).toBeGreaterThan(0.4);
    expect(similarity(earlier, "Tired of paying for Buffer? Here's what we did instead.")).toBe(1);
  });

  it("lets a genuinely different post through", () => {
    expect(similarity(earlier, "What's the one platform you'd never schedule to? Asking for a roadmap.")).toBeLessThan(0.2);
  });

  it("ignores links, mentions and punctuation", () => {
    expect(similarity("Ship it today! @team https://a.com", "ship it today https://b.com")).toBe(1);
  });

  it("checks the history and the drafts already written", () => {
    expect(findRepeat("Tired of paying for Buffer? Try this.", [earlier])).toBe(earlier);
    const sibling = "Your comments deserve answers. Kyrelo drafts replies you approve.";
    expect(findRepeat("Your comments deserve answers. Kyrelo drafts replies you approve, in your voice.", [], [sibling])).toBe(sibling);
    expect(findRepeat("A completely new thought about video trimming.", [earlier], [sibling])).toBeNull();
  });
});

describe("repeatedDrafts", () => {
  it("finds drafts that repeat the history or an earlier draft", async () => {
    const { repeatedDrafts } = await import("./campaign-ai");
    const d = (text: string) => ({ angle: "", text, media: { kind: "none" as const, libraryId: "", youtubeUrl: "", imagePrompt: "", screenshotUrl: "" }, sources: [] });
    const history = ["Stop paying for schedulers. Kyrelo is free and runs on your own computer."];
    const drafts = [
      d("Stop paying for schedulers. Kyrelo is free and runs on your computer."),
      d("Your comments deserve an answer: Kyrelo drafts replies you approve."),
      d("Your comments deserve an answer: Kyrelo drafts replies that you approve."),
      d("What would you post if scheduling were free?"),
    ];
    expect(repeatedDrafts(drafts, history)).toEqual([0, 2]);
  });
});
