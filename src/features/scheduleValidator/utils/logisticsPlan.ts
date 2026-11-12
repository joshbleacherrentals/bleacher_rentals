import { normalizeStreet } from "@/features/autoWorkTrackers/utils/discoverTrips";

/**
 * The logistics-plan check. A bleacher assigned to an event that starts on `startDate` should
 * already be at that event's street by then. Where it was is the last thing that happened to it on
 * or before that day: a work tracker (it ended up at the drop-off), an event (it is at the event's
 * address, or its venue's) or a maintenance event (it is at the maintenance address). When that
 * place is the event's street, the bleacher has a plan. Pure: dates are "YYYY-MM-DD" strings, and
 * "the same street" is decided on the street text.
 */

export type HistoryKind = "work_tracker" | "event" | "maintenance";

/**
 * Somewhere a bleacher was. `date` is the day it got there: a work tracker's date, or the end date
 * of an event or maintenance event.
 */
export type HistoryItem = {
  kind: HistoryKind;
  id: string;
  date: string;
  /** Street text of where the bleacher was left. Null when that place has no street. */
  street: string | null;
  /** Shown beside the location: the event's name, say. */
  label: string;
};

export type PlannedBleacher = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherTypeName: string | null;
  history: HistoryItem[];
};

/** An event that starts in the week, with the bleachers assigned to it. */
export type PlannedEvent = {
  eventId: string;
  eventName: string;
  startDate: string;
  /** Street text of the event's location. Null when it has none. */
  street: string | null;
  bleachers: PlannedBleacher[];
};

export type BleacherCheck = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherTypeName: string | null;
  /** Where the bleacher was last, or null when nothing is known about it before the start date. */
  last: HistoryItem | null;
  matches: boolean;
};

export type EventLogisticsCheck = Omit<PlannedEvent, "bleachers"> & { bleachers: BleacherCheck[] };

// When two things are dated the same day, the one that happens last wins: a work tracker moves the
// bleacher after an event or maintenance ends.
const KIND_RANK: Record<HistoryKind, number> = { work_tracker: 3, maintenance: 2, event: 1 };

/** The latest item on or before `startDate`, leaving out the event being checked. */
export function lastKnownLocation(
  history: HistoryItem[],
  startDate: string,
  currentEventId: string,
): HistoryItem | null {
  const before = history.filter(
    (h) => h.date <= startDate && !(h.kind === "event" && h.id === currentEventId),
  );
  before.sort((a, b) => b.date.localeCompare(a.date) || KIND_RANK[b.kind] - KIND_RANK[a.kind]);
  return before[0] ?? null;
}

const sameStreet = (a: string | null, b: string | null) =>
  normalizeStreet(a) !== "" && normalizeStreet(a) === normalizeStreet(b);

/** Each event with each of its bleachers checked, ordered by start date then name, then number. */
export function checkLogisticsPlans(events: PlannedEvent[]): EventLogisticsCheck[] {
  return events
    .filter((e) => e.bleachers.length > 0)
    .map((event) => ({
      ...event,
      bleachers: event.bleachers
        .map((bleacher): BleacherCheck => {
          const last = lastKnownLocation(bleacher.history, event.startDate, event.eventId);
          return {
            bleacherUuid: bleacher.bleacherUuid,
            bleacherNumber: bleacher.bleacherNumber,
            bleacherTypeName: bleacher.bleacherTypeName,
            last,
            matches: last !== null && sameStreet(last.street, event.street),
          };
        })
        .sort(
          (a, b) =>
            (a.bleacherNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.bleacherNumber ?? Number.MAX_SAFE_INTEGER),
        ),
    }))
    .sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.eventName.localeCompare(b.eventName),
    );
}
