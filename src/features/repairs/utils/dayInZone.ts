import { DateTime } from "luxon";

/**
 * The calendar day (`YYYY-MM-DD`) a stored timestamp falls on in `timezone`, or null when the value
 * is empty or is not a timestamp. A value written without an offset is read as UTC, which is how
 * Postgres timestamps reach the local database.
 *
 * It repeats the one-line rule of `bookedAtDay` on purpose: that helper belongs to the quote page's
 * booked date. docs/specs/repairs-03-list-query.md §2 ("day(x)") and D37.
 */
export function dayInZone(value: string | null | undefined, timezone: string): string | null {
  if (!value) return null;
  const text = value.trim().replace(" ", "T");
  if (!text) return null;
  const moment = DateTime.fromISO(text, { zone: "utc" }).setZone(timezone);
  return moment.isValid ? moment.toFormat("yyyy-MM-dd") : null;
}
