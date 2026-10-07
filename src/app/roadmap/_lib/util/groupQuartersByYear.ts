import type { Quarter } from "../types";

export type QuarterKind = "future" | "current" | "past";

export type QuarterItem = {
  quarter: number;
  kind: QuarterKind;
  /** False only for the current quarter when nobody has created it yet. */
  exists: boolean;
  existing: Quarter | null;
};

export type YearGroup = {
  year: number;
  items: QuarterItem[];
  /** Only the current year starts expanded. */
  defaultExpanded: boolean;
};

/**
 * Shapes the roadmap home page: newest year first, newest quarter first within a year.
 *
 * The current year is always present, and always contains the current quarter — as a "create it"
 * placeholder if it does not exist yet — so the page never lacks an obvious next step. Other years
 * appear only when they hold at least one quarter.
 */
export function groupQuartersByYear(quarters: Quarter[], now: Date = new Date()): YearGroup[] {
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  const kindOf = (year: number, quarter: number): QuarterKind => {
    if (year !== currentYear) return year > currentYear ? "future" : "past";
    if (quarter === currentQuarter) return "current";
    return quarter > currentQuarter ? "future" : "past";
  };

  const byYear = new Map<number, Quarter[]>();
  for (const q of quarters) byYear.set(q.year, [...(byYear.get(q.year) ?? []), q]);
  if (!byYear.has(currentYear)) byYear.set(currentYear, []);

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => {
      const items: QuarterItem[] = rows.map((existing) => ({
        quarter: existing.quarter,
        kind: kindOf(year, existing.quarter),
        exists: true,
        existing,
      }));
      if (year === currentYear && !rows.some((r) => r.quarter === currentQuarter)) {
        items.push({ quarter: currentQuarter, kind: "current", exists: false, existing: null });
      }
      items.sort((a, b) => b.quarter - a.quarter);
      return { year, items, defaultExpanded: year === currentYear };
    });
}
