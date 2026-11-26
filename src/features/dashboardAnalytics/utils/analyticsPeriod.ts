import type { AnalyticsRepair, Period } from "./analyticsTypes";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.3. The year logic of the page: which years
// the selector lists, which period is valid, and the oldest CAD day that spec 03's hook asks for.

/**
 * The year of a repair: the first four digits of its day (D12). `event_start` is a date with no
 * time of day, so no time zone is involved. `null` for a text that does not start with a year.
 */
export function yearOfDay(day: string): number | null {
  return /^\d{4}/.test(day) ? Number(day.slice(0, 4)) : null;
}

/** The distinct years of the live repairs plus the current year, newest first (D11). */
export function analyticsYears(repairs: AnalyticsRepair[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const repair of repairs) {
    const year = yearOfDay(repair.eventStart);
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * `choice` when it is All time or a year of the list, otherwise the current year. This keeps the
 * page valid when the chosen year loses its last repair while it is open.
 */
export function resolvePeriod(choice: Period, years: number[], currentYear: number): Period {
  if (choice.kind === "all" || years.includes(choice.year)) return choice;
  return { kind: "year", year: currentYear };
}

/** The smallest `event_start` among the live CAD repairs of all time, or `null` (spec 03's hook). */
export function oldestCadDay(repairs: AnalyticsRepair[]): string | null {
  let oldest: string | null = null;
  for (const repair of repairs) {
    if (repair.currency !== "CAD" || !repair.eventStart) continue;
    if (oldest === null || repair.eventStart < oldest) oldest = repair.eventStart;
  }
  return oldest;
}
