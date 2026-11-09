import { DateTime } from "luxon";

/**
 * A week is Monday to Sunday, both days included. It is identified by its Monday as a plain
 * "YYYY-MM-DD" date, the same shape the Work Trackers pages use in /work-trackers/[startDate].
 *
 * Everything here is calendar-date arithmetic done in UTC, so a daylight saving change can never
 * move a week by an hour and push it onto the wrong day.
 */

const parse = (isoDate: string) => DateTime.fromISO(isoDate, { zone: "utc" });

/** The Monday of the week containing `isoDate` (luxon's weeks start on Monday). */
export function weekStartOf(isoDate: string): string {
  return parse(isoDate).startOf("week").toISODate()!;
}

/** The Sunday that closes the week starting on `weekStart`. */
export function weekEndOf(weekStart: string): string {
  return parse(weekStart).plus({ days: 6 }).toISODate()!;
}

/** The Monday `weeks` weeks after (or, when negative, before) `weekStart`. */
export function shiftWeek(weekStart: string, weeks: number): string {
  return parse(weekStart).plus({ weeks }).toISODate()!;
}

/** The Monday of the current week, by the viewer's own calendar day. */
export function currentWeekStart(): string {
  return weekStartOf(DateTime.now().toISODate()!);
}

/** e.g. "Mon, Nov 9 – Sun, Nov 15" */
export function formatWeekLabel(weekStart: string): string {
  const start = parse(weekStart);
  const end = parse(weekEndOf(weekStart));
  return `${start.toFormat("ccc, LLL d")} – ${end.toFormat("ccc, LLL d")}`;
}
