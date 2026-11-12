import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseWeekParam } from "./selectedWeek";

describe("parseWeekParam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z")); // a Wednesday
  });
  afterEach(() => vi.useRealTimers());

  it("reads a Monday as that week", () => {
    expect(parseWeekParam("2026-11-23")).toBe("2026-11-23");
  });

  it("moves any other day of the week back to its Monday", () => {
    expect(parseWeekParam("2026-11-26")).toBe("2026-11-23");
  });

  it("falls back to the current week when missing or unreadable", () => {
    for (const value of [null, undefined, "", "soon", "2026-13-40"]) {
      expect(parseWeekParam(value), String(value)).toBe("2026-11-09");
    }
  });
});
