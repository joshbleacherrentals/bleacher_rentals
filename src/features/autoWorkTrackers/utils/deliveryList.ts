import { DateTime } from "luxon";
import type {
  BleacherCheck,
  EventLogisticsCheck,
  HistoryItem,
} from "@/features/scheduleValidator/utils/logisticsPlan";
import { straightLineKm } from "./distance";

/**
 * The bleacher deliveries list: from the schedule validator's check of each event, every assigned
 * bleacher, marked ready when it is already at the event's street and otherwise given how long there
 * is to move it and how far it has to go. Events with work left come first. Pure.
 */

export type DeliveryBleacher = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherTypeName: string | null;
  /** Already at the event's street by the event's start: nothing to deliver. */
  ready: boolean;
  /** Where the bleacher was last as of the event's start date, or null when nothing is known. */
  last: HistoryItem | null;
  /** Whole days from the day it got there to the event's start. Null with no known location. */
  daysAvailable: number | null;
  /** Straight-line kilometres from the last location to the event. Null when either end has no coordinates. */
  distanceKm: number | null;
};

export type EventDeliveries = Omit<EventLogisticsCheck, "bleachers"> & {
  bleachers: DeliveryBleacher[];
  /** How many of the bleachers still need a trip. */
  toDeliver: number;
  /** Has bleachers and every one is ready. */
  allReady: boolean;
};

const daysBetween = (from: string, to: string) =>
  Math.round(
    DateTime.fromISO(to, { zone: "utc" }).diff(DateTime.fromISO(from, { zone: "utc" }), "days")
      .days,
  );

function toDelivery(bleacher: BleacherCheck, event: EventLogisticsCheck): DeliveryBleacher {
  const { last } = bleacher;
  return {
    bleacherUuid: bleacher.bleacherUuid,
    bleacherNumber: bleacher.bleacherNumber,
    bleacherTypeName: bleacher.bleacherTypeName,
    ready: bleacher.matches,
    last,
    daysAvailable: last && !bleacher.matches ? daysBetween(last.date, event.startDate) : null,
    distanceKm: last && !bleacher.matches ? straightLineKm(last, event) : null,
  };
}

const byNumber = (a: DeliveryBleacher, b: DeliveryBleacher) =>
  (a.bleacherNumber ?? Number.MAX_SAFE_INTEGER) - (b.bleacherNumber ?? Number.MAX_SAFE_INTEGER);

/**
 * Every event, with all its bleachers. Events with bleachers still to deliver come first, in the
 * order given, then the events that are ready. Within an event the bleachers to deliver come first
 * (no known location, then the least time to move, then by number), then the ready ones by number.
 */
export function buildDeliveryList(events: EventLogisticsCheck[]): EventDeliveries[] {
  const built = events.map((event) => {
    const all = event.bleachers.map((b) => toDelivery(b, event));
    const todo = all
      .filter((b) => !b.ready)
      .sort(
        (a, b) => (a.daysAvailable ?? -Infinity) - (b.daysAvailable ?? -Infinity) || byNumber(a, b),
      );
    const ready = all.filter((b) => b.ready).sort(byNumber);
    return {
      ...event,
      bleachers: [...todo, ...ready],
      toDeliver: todo.length,
      allReady: all.length > 0 && todo.length === 0,
    };
  });
  return [...built.filter((e) => e.toDeliver > 0), ...built.filter((e) => e.toDeliver === 0)];
}
