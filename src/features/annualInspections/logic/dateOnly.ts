/**
 * Calendar-day arithmetic for the annual inspection dates.
 *
 * Everything here works on "YYYY-MM-DD" strings and goes through UTC
 * internally, so a bleacher never changes status because of who is reading it.
 * `next_due_on` is a Postgres `date` for the same reason — see
 * docs/specs/bleacher-annual-inspections.md §3.1.
 */

const MS_PER_DAY = 86_400_000;

/** Midnight UTC on a "YYYY-MM-DD" day. */
function toUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * MS_PER_DAY));
}

/** The local calendar day of a stored timestamp — the day the user was looking. */
export function localDayOf(timestamp: string): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today as a calendar day in the reader's own timezone. */
export function todayLocal(now: Date = new Date()): string {
  return localDayOf(now.toISOString());
}
