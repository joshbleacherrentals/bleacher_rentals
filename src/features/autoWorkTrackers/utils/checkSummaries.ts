import type { EventDeliveries } from "./deliveryList";
import type { EventBleachers } from "@/features/scheduleValidator/hooks/useEventsBleachers";
import type {
  BleacherBooking,
  OverbookedBleacher,
} from "@/features/scheduleValidator/utils/overbooked";
import type { DriverWorkload } from "@/features/scheduleValidator/utils/driverWorkload";
import type { DriverAvailability } from "@/features/scheduleValidator/utils/driverAvailability";

/**
 * How a check came out for the week: how many of the things it checks passed, out of how many. Each
 * check counts its own kind of thing (events, bleachers or drivers). Pure: no database.
 */
export type CheckSummary = { passed: number; total: number };

const count = <T>(items: T[], passes: (item: T) => boolean): CheckSummary => ({
  passed: items.filter(passes).length,
  total: items.length,
});

/** Events starting this week, passing when every bleacher is already at the event. */
export function summarizeEventFulfilment(events: EventDeliveries[]): CheckSummary {
  return count(events, (e) => e.toDeliver === 0);
}

/** Events starting this week, passing when the bleachers selected match what the event requires. */
export function summarizeEventBleacherRequirements(
  eventIds: string[],
  byEvent: Map<string, EventBleachers>,
): CheckSummary {
  return count(eventIds, (id) => byEvent.get(id)?.matches === true);
}

/** Bleachers booked around this week, passing when not on two events that overlap. */
export function summarizeOverbookedBleachers(
  bookings: BleacherBooking[],
  overbooked: OverbookedBleacher[],
): CheckSummary {
  const booked = new Set(bookings.map((b) => b.bleacherUuid));
  const bad = new Set(overbooked.map((b) => b.bleacherUuid));
  return count([...booked], (uuid) => !bad.has(uuid));
}

/** Drivers with a trip this week, passing when no day is over the driving limit. */
export function summarizeDriverWorkload(drivers: DriverWorkload[]): CheckSummary {
  return count(drivers, (d) => d.days.every((day) => !day.overLimit));
}

/** Drivers with a trip or a day off this week, passing when no trip lands on a day off. */
export function summarizeDriverAvailability(drivers: DriverAvailability[]): CheckSummary {
  return count(drivers, (d) => d.ok);
}

/** Green when everything passed (nothing to check counts as passing), red otherwise. */
export function summaryTone(summary: CheckSummary): "good" | "bad" {
  return summary.passed === summary.total ? "good" : "bad";
}
