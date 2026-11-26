import { describe, expect, it } from "vitest";
import { analyticsYears, oldestCadDay, resolvePeriod } from "./analyticsPeriod";
import { repair } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.3 and §5. "Deleted repairs absent" is a
// property of the query (it reads `deleted = 0` only, see analyticsQueries.test.ts): a repair of
// these inputs has no `deleted` flag, so every repair here is a live one.

describe("analyticsYears", () => {
  it("lists the distinct years of the repairs plus the current year, newest first", () => {
    const repairs = [
      repair({ id: "a", eventStart: "2024-05-01" }),
      repair({ id: "b", eventStart: "2024-12-31" }),
      repair({ id: "c", eventStart: "2026-01-01" }),
    ];
    expect(analyticsYears(repairs, 2026)).toEqual([2026, 2024]);
    expect(analyticsYears(repairs, 2027)).toEqual([2027, 2026, 2024]);
  });

  it("always holds the current year, also with no repair at all", () => {
    expect(analyticsYears([], 2026)).toEqual([2026]);
  });

  it("takes the year from the first four digits of the day", () => {
    const repairs = [
      repair({ id: "a", eventStart: "2025-12-31" }),
      repair({ id: "b", eventStart: "2023-01-01" }),
    ];
    expect(analyticsYears(repairs, 2026)).toEqual([2026, 2025, 2023]);
  });

  it("counts a CAD repair too: the list does not depend on the rates", () => {
    const repairs = [repair({ id: "a", currency: "CAD", eventStart: "2022-04-04" })];
    expect(analyticsYears(repairs, 2026)).toEqual([2026, 2022]);
  });

  it("does not list a year for a repair with no day", () => {
    const repairs = [repair({ id: "a", eventStart: "" })];
    expect(analyticsYears(repairs, 2026)).toEqual([2026]);
  });
});

describe("resolvePeriod", () => {
  const years = [2026, 2024];

  it("keeps All time", () => {
    expect(resolvePeriod({ kind: "all" }, years, 2026)).toEqual({ kind: "all" });
  });

  it("keeps a year that is in the list", () => {
    expect(resolvePeriod({ kind: "year", year: 2024 }, years, 2026)).toEqual({
      kind: "year",
      year: 2024,
    });
  });

  it("falls back to the current year when the chosen year is not in the list", () => {
    expect(resolvePeriod({ kind: "year", year: 2025 }, years, 2026)).toEqual({
      kind: "year",
      year: 2026,
    });
  });
});

describe("oldestCadDay", () => {
  it("is null with no repair", () => {
    expect(oldestCadDay([])).toBeNull();
  });

  it("is null when there is no CAD repair", () => {
    expect(oldestCadDay([repair({ id: "a", eventStart: "2020-01-01" })])).toBeNull();
  });

  it("is the day of the one CAD repair", () => {
    const repairs = [repair({ id: "a", currency: "CAD", eventStart: "2025-06-15" })];
    expect(oldestCadDay(repairs)).toBe("2025-06-15");
  });

  it("is the smallest day among the CAD repairs, and a USD repair does not count", () => {
    const repairs = [
      repair({ id: "a", currency: "CAD", eventStart: "2026-02-01" }),
      repair({ id: "b", currency: "USD", eventStart: "2019-01-01" }),
      repair({ id: "c", currency: "CAD", eventStart: "2024-11-30" }),
      repair({ id: "d", currency: "CAD", eventStart: "2025-03-03" }),
    ];
    expect(oldestCadDay(repairs)).toBe("2024-11-30");
  });
});
