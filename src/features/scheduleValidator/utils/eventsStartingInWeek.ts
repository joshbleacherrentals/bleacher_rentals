import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";

export type EventRow = { id: string; eventName: string | null; eventStart: string | null };
export type WeekEvent = { id: string; name: string };

/**
 * The events whose start falls on a day of the week beginning `weekStart` (a Monday), by the
 * viewer's own calendar day, earliest first. Events with no start are left out.
 */
export function eventsStartingInWeek(rows: EventRow[], weekStart: string): WeekEvent[] {
  const weekEnd = weekEndOf(weekStart);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.eventName?.trim() || "Untitled event",
      day: timestampToDate(r.eventStart),
      start: r.eventStart,
    }))
    .filter((e) => e.day !== null && e.day >= weekStart && e.day <= weekEnd)
    .sort((a, b) => a.start!.localeCompare(b.start!) || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}
