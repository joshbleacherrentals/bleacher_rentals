import { businessToday, toBusinessDate } from "./pastAlerts";

/**
 * The window "No Transportation" cares about: from today to the end of the week you can still act
 * on, in Toronto time.
 *
 * Monday to Wednesday it closes on this Sunday. From Thursday it closes on next Sunday, which is
 * when the following week becomes close enough to need a truck booked for it. Lead time therefore
 * swings between 4 and 10 days.
 *
 * This is deliberately NOT `getUpcomingWindowEnd`, which always runs to next week's Sunday and is
 * what bounds the cascade ripple.
 */
export function transportationWindowEnd(now: Date = new Date()): string {
  const [year, month, day] = businessToday(now).split("-").map(Number);
  // Noon UTC on that calendar day: far from any boundary, so the arithmetic cannot slip a day.
  const cursor = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = cursor.getUTCDay(); // 0 = Sunday
  const daysToSunday = weekday === 0 ? 7 : weekday <= 3 ? 7 - weekday : 14 - weekday;
  cursor.setUTCDate(cursor.getUTCDate() + daysToSunday);
  return cursor.toISOString().slice(0, 10);
}

/**
 * Whether an event's start falls in that window. Both ends are inclusive.
 *
 * An event that started before today is out, even while it is still running: its bleachers are
 * already where they need to be, so there is no transport left to arrange.
 */
export function isInTransportationWindow(
  eventStart: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = toBusinessDate(eventStart);
  if (!start) return false;
  return start >= businessToday(now) && start <= transportationWindowEnd(now);
}

/** The one alert title this window applies to. */
export const TRANSPORTATION_TITLE = "No Transportation";

/**
 * Hides "No Transportation" alerts for events outside the window, leaving every other alert alone.
 *
 * This filters on read rather than on write: the stored alert stays, so when the window rolls
 * forward on Thursday the events it now covers light up immediately. Deleting them instead would
 * leave those events silently un-alerted until someone happened to save one.
 *
 * An alert whose start date is unknown locally (entity not synced) is kept.
 */
export function hideOutOfWindowTransportationAlerts<
  T extends { title: string | null; entityStartDate: string | null },
>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter(
    (row) =>
      row.title !== TRANSPORTATION_TITLE ||
      row.entityStartDate === null ||
      isInTransportationWindow(row.entityStartDate, now),
  );
}
