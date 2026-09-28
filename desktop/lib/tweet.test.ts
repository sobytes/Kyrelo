import { describe, expect, it } from "vitest";
import { tweetLength } from "./tweet";

describe("tweetLength", () => {
  it("counts plain text by characters", () => {
    expect(tweetLength("hello world")).toBe(11);
  });

  it("counts every URL as 23 characters, like X", () => {
    expect(tweetLength("see https://example.com/a/very/long/path/that/goes/on")).toBe(4 + 23);
    expect(tweetLength("https://a.co and https://b.co")).toBe(23 + 5 + 23);
  });
});
