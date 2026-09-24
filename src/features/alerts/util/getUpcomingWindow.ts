import { businessToday } from "./pastAlerts";

/**
 * The end of the "upcoming" window — the Sunday that closes next week — as a Toronto YYYY-MM-DD.
 *
 * Both bounds of that window are plain dates, because every column they are compared against
 * (`Events.event_start`, `Events.event_end`, `WorkTrackers.date`) is a DATE, stored locally as
 * "YYYY-MM-DD". An instant like "2026-09-27T23:59:59.999Z" sorts after every row on its own day as
 * text; used as the lower bound it sorted after every row dated today, dropping them silently.
 *
 * The week is read in Toronto (see `businessToday`): on a Sunday evening here, UTC already says
 * Monday, which would push the window a week out.
 */
export function getUpcomingWindowEnd(now: Date = new Date()): string {
  const [year, month, day] = businessToday(now).split("-").map(Number);
  // Noon UTC on that calendar day: far from any boundary, so the arithmetic below cannot slip a day.
  const cursor = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = cursor.getUTCDay(); // 0 = Sunday
  cursor.setUTCDate(cursor.getUTCDate() + (weekday === 0 ? 7 : 14 - weekday));
  return cursor.toISOString().slice(0, 10);
}
