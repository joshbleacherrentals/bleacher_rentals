import { DateTime } from "luxon";

/** "Nov 9", "Nov 9–12" or "Nov 30 – Dec 2", for two "YYYY-MM-DD" dates (end on or after start). */
export function formatDateRange(start: string, end: string): string {
  const from = DateTime.fromISO(start, { zone: "utc" });
  const to = DateTime.fromISO(end, { zone: "utc" });
  if (start === end) return from.toFormat("LLL d");
  if (from.month === to.month && from.year === to.year) {
    return `${from.toFormat("LLL d")}–${to.toFormat("d")}`;
  }
  return `${from.toFormat("LLL d")} – ${to.toFormat("LLL d")}`;
}
