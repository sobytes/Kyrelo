import { describe, expect, it } from "vitest";
import { splitTitle } from "./title";

describe("splitTitle", () => {
  it("takes the first non-empty line as the title and the rest as the body", () => {
    expect(splitTitle("\n  Hello world  \n\nBody here\nmore", 100)).toEqual({ title: "Hello world", body: "Body here\nmore" });
    expect(splitTitle("Only a title", 100)).toEqual({ title: "Only a title", body: "" });
    expect(splitTitle("   ", 100)).toEqual({ title: "", body: "" });
  });

  it("cuts a long title at the limit, counting what people see", () => {
    expect(splitTitle("🎉".repeat(10), 5).title).toBe("🎉🎉🎉🎉…");
  });
});
