import { MONTHS, YEARS } from "./data";
import type { MonthEntry, Release, YearEntry } from "./types";

export const BASE_PATH = "/changelog-v2";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

export const yearHref = (year: number) => `${BASE_PATH}/${year}`;
export const monthHref = (year: number, month: number) => `${BASE_PATH}/${year}/${pad(month)}`;
export const releaseHref = (year: number, month: number, version: string) =>
  `${BASE_PATH}/${year}/${pad(month)}/${version}`;

/** Newest first, whatever order the data files are listed in. */
const months = [...MONTHS].sort((a, b) => b.year - a.year || b.month - a.month);

export const monthsOfYear = (year: number) => months.filter((m) => m.year === year);
export const allYears = () => [...YEARS].sort((a, b) => b.year - a.year);

export type FlatRelease = { release: Release; month: MonthEntry };
const flat: FlatRelease[] = months.flatMap((month) =>
  month.releases.map((release) => ({ release, month })),
);

export const latest = (): FlatRelease => flat[0];

export type View =
  | {
      kind: "release";
      current: FlatRelease;
      newer: FlatRelease | null;
      older: FlatRelease | null;
      isLatest: boolean;
    }
  | { kind: "month"; month: MonthEntry }
  | { kind: "year"; year: YearEntry; months: MonthEntry[] };

function releaseView(current: FlatRelease): View {
  const i = flat.indexOf(current);
  return {
    kind: "release",
    current,
    newer: flat[i - 1] ?? null,
    older: flat[i + 1] ?? null,
    isLatest: i === 0,
  };
}

/** `/changelog-v2` opens the newest release; each deeper segment narrows to a year, month or release. */
export function resolve(slug: string[] = []): View | null {
  if (slug.length === 0) return releaseView(latest());
  const year = Number(slug[0]);
  if (slug.length === 1) {
    const entry = YEARS.find((y) => y.year === year);
    return entry ? { kind: "year", year: entry, months: monthsOfYear(year) } : null;
  }
  const month = months.find((m) => m.year === year && m.month === Number(slug[1]));
  if (!month) return null;
  if (slug.length === 2) return { kind: "month", month };
  const found = flat.find((f) => f.month === month && f.release.version === slug[2]);
  return found ? releaseView(found) : null;
}
