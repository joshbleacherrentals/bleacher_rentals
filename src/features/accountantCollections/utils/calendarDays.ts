/**
 * Whole calendar days between `YYYY-MM-DD` strings.
 *
 * Both go through UTC dates, so a day is always exactly 86 400 000 ms: Toronto's clock changes
 * (March and November) cannot make a day 23 or 25 hours long.
 */

const MS_PER_DAY = 86_400_000;

function toUtcMs(date: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** The date `n` days after `date` (before it when `n` is negative). */
export function addDays(date: string, n: number): string {
  return new Date(toUtcMs(date) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** How many days `to` is after `from`: positive when later, negative when earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}
