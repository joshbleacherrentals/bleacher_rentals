import { DateTime } from "luxon";
import { todayISO } from "./buildDefaultPaymentSchedule";

/**
 * "Today" as YYYY-MM-DD in the timezone the page's date filters use, and how
 * long until that day ends — so a page left open overnight can roll over.
 */

const ONE_SECOND = 1000;
const ONE_HOUR = 60 * 60 * ONE_SECOND;

export function todayInZone(timezone: string, now: DateTime = DateTime.now()): string {
  return now.setZone(timezone).toISODate() ?? todayISO();
}

/**
 * Milliseconds until the next midnight in `timezone` (a daylight-saving day is
 * 23 or 25 hours, which the calendar arithmetic takes care of). Never under a
 * second, so a timer set from it cannot spin; an unknown timezone is rechecked
 * within the hour.
 */
export function msUntilNextDay(timezone: string, now: DateTime = DateTime.now()): number {
  const local = now.setZone(timezone);
  if (!local.isValid) return ONE_HOUR;
  const nextMidnight = local.plus({ days: 1 }).startOf("day");
  return Math.max(ONE_SECOND, nextMidnight.toMillis() - local.toMillis());
}
