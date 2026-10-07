import { describe, it, expect } from "vitest";
import { groupQuartersByYear } from "./groupQuartersByYear";
import type { Quarter } from "../types";

const q = (year: number, quarter: number): Quarter => ({
  id: `${year}-q${quarter}`,
  created_at: "",
  year,
  quarter,
});

// Aug 15, 2026 → Q3 2026
const NOW = new Date(2026, 7, 15);

describe("groupQuartersByYear", () => {
  it("puts newest years first and newest quarters first within a year", () => {
    const groups = groupQuartersByYear([q(2025, 1), q(2027, 2), q(2026, 1), q(2026, 4)], NOW);
    expect(groups.map((g) => g.year)).toEqual([2027, 2026, 2025]);
    expect(groups[1].items.map((i) => i.quarter)).toEqual([4, 3, 1]);
  });

  it("marks quarters as future, current or past relative to today", () => {
    const [g] = groupQuartersByYear([q(2026, 4), q(2026, 3), q(2026, 2)], NOW);
    expect(g.items.map((i) => i.kind)).toEqual(["future", "current", "past"]);
  });

  it("expands only the current year by default", () => {
    const groups = groupQuartersByYear([q(2027, 1), q(2026, 3), q(2025, 4)], NOW);
    expect(groups.map((g) => [g.year, g.defaultExpanded])).toEqual([
      [2027, false],
      [2026, true],
      [2025, false],
    ]);
  });

  it("offers to create the current quarter when it does not exist, in chronological place", () => {
    const [g] = groupQuartersByYear([q(2026, 4), q(2026, 1)], NOW);
    expect(g.items.map((i) => [i.quarter, i.kind, i.exists])).toEqual([
      [4, "future", true],
      [3, "current", false],
      [1, "past", true],
    ]);
    expect(g.items[1].existing).toBeNull();
  });

  it("always shows the current year, even with no quarters at all", () => {
    const groups = groupQuartersByYear([], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ year: 2026, defaultExpanded: true });
    expect(groups[0].items).toEqual([
      { quarter: 3, kind: "current", exists: false, existing: null },
    ]);
  });

  it("only lists other years that have a quarter, and never invents their quarters", () => {
    const groups = groupQuartersByYear([q(2024, 2)], NOW);
    expect(groups.map((g) => g.year)).toEqual([2026, 2024]);
    expect(groups[1].items).toHaveLength(1);
  });

  it("treats a quarter in another year as future or past by year alone", () => {
    const groups = groupQuartersByYear([q(2027, 1), q(2025, 4)], NOW);
    expect(groups.find((g) => g.year === 2027)!.items[0].kind).toBe("future");
    expect(groups.find((g) => g.year === 2025)!.items[0].kind).toBe("past");
  });
});
