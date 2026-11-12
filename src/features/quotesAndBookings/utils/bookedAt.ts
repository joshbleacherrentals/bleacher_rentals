import { DateTime } from "luxon";

/**
 * The booked date on the quote page's date button. `Events.booked_at` is a full timestamp (a client's
 * signature writes the exact moment), but the button picks only a day. A chosen day is saved at
 * 12:00 in the app's timezone (useTimezoneStore), the same zone the lists filter in, and a stored
 * value is shown as the day it falls on in that zone, so the day that was picked is the day that is
 * shown.
 */

/** The hour of the day, in the app's timezone, at which a chosen day is saved. */
const SAVED_AT_HOUR = 12;

/** The day (`YYYY-MM-DD`) a stored `booked_at` falls on in `timezone`; null if it has none. */
export function bookedAtDay(bookedAt: string | null, timezone: string): string | null {
  if (!bookedAt) return null;
  const moment = DateTime.fromISO(bookedAt, { zone: timezone });
  return moment.isValid ? moment.toFormat("yyyy-MM-dd") : null;
}

/** The `booked_at` (UTC ISO) of a chosen day (`YYYY-MM-DD`): 12:00 that day in `timezone`. */
export function bookedAtFromDay(day: string, timezone: string): string {
  const moment = DateTime.fromISO(day, { zone: timezone }).set({
    hour: SAVED_AT_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !moment.isValid) {
    throw new Error(`"${day}" is not a valid day.`);
  }
  return moment.toUTC().toISO()!;
}

/** A day written as the lists write it (`Nov 5, 2026`); a dash when there is none. */
export function formatBookedDay(day: string | null): string {
  if (!day) return "—";
  const moment = DateTime.fromISO(day, { zone: "utc" }).setLocale("en-US");
  return moment.isValid ? moment.toFormat("MMM d, yyyy") : "—";
}
