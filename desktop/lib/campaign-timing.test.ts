import { describe, expect, it } from "vitest";
import { spreadTimes } from "./campaign-timing";

const START = Date.UTC(2026, 8, 26, 14, 0, 0);
const MINUTE = 60_000;

describe("spreadTimes", () => {
  it("returns nothing for zero posts", () => {
    expect(spreadTimes(0, 60)).toEqual([]);
  });

  it("keeps 4 posts in an hour inside the window, in order, and spaced out", () => {
    for (let run = 0; run < 2_000; run++) {
      const times = spreadTimes(4, 60, { start: START }).map((d) => d.getTime());
      expect(times).toHaveLength(4);
      expect(times[0] - START).toBeGreaterThanOrEqual(2 * MINUTE * 0.99);
      expect(times[3]).toBeLessThanOrEqual(START + 60 * MINUTE);
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(5 * MINUTE);
      }
    }
  });

  it("uses the injected random source (edges of each slot)", () => {
    const low = spreadTimes(3, 60, { start: START, random: () => 0 }).map((d) => d.getTime());
    const high = spreadTimes(3, 60, { start: START, random: () => 0.999 }).map((d) => d.getTime());
    for (let i = 0; i < 3; i++) expect(high[i]).toBeGreaterThan(low[i]);
  });
});
