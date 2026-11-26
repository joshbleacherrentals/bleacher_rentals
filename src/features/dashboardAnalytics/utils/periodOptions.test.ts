import { describe, expect, it } from "vitest";
import { periodFromValue, periodLabel, periodOptions } from "./periodOptions";

// docs/specs/dashboard-analytics-05-page.md §2.2: what the period dropdown lists. The years arrive
// from `analyticsYears`, newest first; All time is always the last option.

describe("periodOptions", () => {
  it("lists the years in the given order, then All time", () => {
    expect(periodOptions([2026, 2025, 2024], { kind: "year", year: 2026 })).toEqual([
      { value: "2026", label: "2026", checked: true },
      { value: "2025", label: "2025", checked: false },
      { value: "2024", label: "2024", checked: false },
      { value: "all", label: "All time", checked: false },
    ]);
  });

  it("ticks All time only when the period is All time", () => {
    const options = periodOptions([2026, 2025], { kind: "all" });
    expect(options.filter((o) => o.checked).map((o) => o.value)).toEqual(["all"]);
  });

  it("lists only All time when there is no year", () => {
    expect(periodOptions([], { kind: "all" })).toEqual([
      { value: "all", label: "All time", checked: true },
    ]);
  });
});

describe("periodFromValue", () => {
  it("reads a year", () => {
    expect(periodFromValue("2025")).toEqual({ kind: "year", year: 2025 });
  });

  it("reads all", () => {
    expect(periodFromValue("all")).toEqual({ kind: "all" });
  });

  it("returns null for anything else", () => {
    expect(periodFromValue("")).toBeNull();
    expect(periodFromValue("abc")).toBeNull();
    expect(periodFromValue("20x5")).toBeNull();
  });
});

describe("periodLabel", () => {
  it("is the year, or All time", () => {
    expect(periodLabel({ kind: "year", year: 2026 })).toBe("2026");
    expect(periodLabel({ kind: "all" })).toBe("All time");
  });
});
