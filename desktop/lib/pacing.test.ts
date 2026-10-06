import { describe, expect, it } from "vitest";
import { isQuietHours } from "./pacing";

describe("isQuietHours", () => {
  it("is quiet from 1am to 7am local time", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m);
    expect(isQuietHours(at(0, 59))).toBe(false);
    expect(isQuietHours(at(1))).toBe(true);
    expect(isQuietHours(at(6, 59))).toBe(true);
    expect(isQuietHours(at(7))).toBe(false);
    expect(isQuietHours(at(15))).toBe(false);
  });
});
