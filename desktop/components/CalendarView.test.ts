import { describe, expect, it } from "vitest";
import { monthGrid } from "./CalendarView";

describe("monthGrid", () => {
  it("covers the month in six Monday-first weeks", () => {
    const days = monthGrid(new Date(2026, 9, 15)); // October 2026 starts on a Thursday
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual(new Date(2026, 8, 28)); // Monday 28 September
    expect(days[3]).toEqual(new Date(2026, 9, 1));
    expect(days.every((d, i) => i === 0 || d.getTime() > days[i - 1].getTime())).toBe(true);
  });

  it("starts on the 1st when the month begins on a Monday", () => {
    expect(monthGrid(new Date(2026, 5, 10))[0]).toEqual(new Date(2026, 5, 1)); // June 2026
  });
});
