import type { EventLogisticsCheck } from "@/features/scheduleValidator/utils/logisticsPlan";
import type { WeekEvent } from "@/features/scheduleValidator/utils/eventsStartingInWeek";

/**
 * The zone's events for the week, as the Dashboard and Event Fulfilment see them: the events starting
 * that week with at least one bleacher from the zone (events have no zone of their own, so a
 * bleacher's zone decides). Keeps their order (start date, then name).
 */
export function zoneWeekEvents(events: EventLogisticsCheck[]): WeekEvent[] {
  return events.map((e) => ({ id: e.eventId, name: e.eventName }));
}
