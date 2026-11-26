import type { Period } from "./analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.2. What the period dropdown lists. `years` comes
// from `analyticsYears` (newest first); All time is always the last option. The value of an option
// is the year as text, or "all", which is what the radio group of the dropdown carries.

export type PeriodOption = { value: string; label: string; checked: boolean };

const ALL_VALUE = "all";

export function periodValue(period: Period): string {
  return period.kind === "all" ? ALL_VALUE : String(period.year);
}

export function periodLabel(period: Period): string {
  return period.kind === "all" ? "All time" : String(period.year);
}

export function periodOptions(years: number[], period: Period): PeriodOption[] {
  const periods: Period[] = [
    ...years.map((year): Period => ({ kind: "year", year })),
    { kind: "all" },
  ];
  const chosen = periodValue(period);
  return periods.map((option) => ({
    value: periodValue(option),
    label: periodLabel(option),
    checked: periodValue(option) === chosen,
  }));
}

/** The period of an option value, or null for a value that is neither "all" nor a year. */
export function periodFromValue(value: string): Period | null {
  if (value === ALL_VALUE) return { kind: "all" };
  return /^\d{4}$/.test(value) ? { kind: "year", year: Number(value) } : null;
}
