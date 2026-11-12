import { DateTime } from "luxon";

/**
 * Finds the trips a zone's bleachers need, from where their events put them.
 *
 * A bleacher must be at an event's address from the event's start to its end. Between two events at
 * different addresses it has to move, and that move is a trip needed. The move can be done on any
 * day after the first event's last day to the second event's start (its window). Work trackers already
 * made for the bleacher inside that window count as part of the move: one that picks the bleacher
 * up where it is carries it to its drop-off, and only the rest of the way is still needed.
 *
 * "Same place" means the same street text (see `normalizeStreet`), because the same building can sit
 * in the Addresses table under more than one id.
 *
 * Pure: no database, no clock. Dates are "YYYY-MM-DD" strings, which compare correctly as text.
 */

/** One booked event, as the place the bleacher has to be and the days it has to be there. */
export type BleacherStop = {
  eventUuid: string;
  eventName: string | null;
  /** Street text of the event's address (or its venue's). Null when the event has none. */
  street: string | null;
  /** First day the bleacher has to be there: setup start, else event start. */
  startDate: string;
  /** Last day it has to be there: teardown end, else event end. */
  endDate: string;
};

/** A work tracker that already moves this bleacher. */
export type ExistingTrip = {
  workTrackerUuid: string;
  date: string | null;
  pickupStreet: string | null;
  dropoffStreet: string | null;
};

export type BleacherInput = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  stops: BleacherStop[];
  trips: ExistingTrip[];
};

export type NeededTrip = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  fromStreet: string;
  toStreet: string;
  /** The event the bleacher is leaving. */
  fromEventUuid: string;
  /** The event it has to reach. */
  toEventUuid: string;
  /** Earliest day the move can happen: the day after the first event's last day. */
  availableFrom: string;
  /** Latest day it can happen: the day the next event starts. */
  mustArriveBy: string;
};

/** Lowercase, punctuation dropped, whitespace collapsed. Empty for a missing street. */
export function normalizeStreet(street: string | null | undefined): string {
  return (street ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The calendar date of a database timestamp ("2026-11-09 12:00:00+00") or a plain date, read the
 * way the rest of the app reads them (the viewer's own day). Null when there is nothing to read.
 */
export function timestampToDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = DateTime.fromISO(value.replace(" ", "T"));
  return parsed.isValid ? parsed.toISODate() : null;
}

function weekEndOf(weekStart: string): string {
  return DateTime.fromISO(weekStart, { zone: "utc" }).plus({ days: 6 }).toISODate()!;
}

function tripsForBleacher(
  bleacher: BleacherInput,
  weekStart: string,
  weekEnd: string,
): NeededTrip[] {
  const stops = bleacher.stops
    .filter((s) => normalizeStreet(s.street) !== "")
    .sort((x, y) => x.startDate.localeCompare(y.startDate) || x.endDate.localeCompare(y.endDate));

  const needed: NeededTrip[] = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const targetKey = normalizeStreet(to.street);
    if (normalizeStreet(from.street) === targetKey) continue;

    // The bleacher is collected the day after its event ends, never on the last day itself. If the
    // next event starts before that, the move is already due, so it opens on that day.
    const mustArriveBy = to.startDate;
    const dayAfterEnd = DateTime.fromISO(from.endDate, { zone: "utc" })
      .plus({ days: 1 })
      .toISODate()!;
    const availableFrom = dayAfterEnd < mustArriveBy ? dayAfterEnd : mustArriveBy;
    // The window has to touch the selected week, but may start long before it or end long after.
    if (availableFrom > weekEnd || mustArriveBy < weekStart) continue;

    // Follow the work trackers already in the window: each one that picks the bleacher up where
    // it currently is moves it on to its drop-off.
    let position = from.street!;
    const inWindow = bleacher.trips
      .filter((t) => t.date !== null && t.date >= availableFrom && t.date <= mustArriveBy)
      .sort((x, y) => x.date!.localeCompare(y.date!));
    for (const trip of inWindow) {
      if (normalizeStreet(trip.dropoffStreet) === "") continue;
      if (normalizeStreet(trip.pickupStreet) === normalizeStreet(position)) {
        position = trip.dropoffStreet!;
      }
    }

    if (normalizeStreet(position) === targetKey) continue;

    needed.push({
      bleacherUuid: bleacher.bleacherUuid,
      bleacherNumber: bleacher.bleacherNumber,
      fromStreet: position,
      toStreet: to.street!,
      fromEventUuid: from.eventUuid,
      toEventUuid: to.eventUuid,
      availableFrom,
      mustArriveBy,
    });
  }

  return needed;
}

/**
 * Every trip the given bleachers need whose window touches the week that starts on `weekStart` (a
 * Monday, "YYYY-MM-DD"). Ordered by bleacher number, then by when the move opens.
 */
export function discoverTrips(bleachers: BleacherInput[], weekStart: string): NeededTrip[] {
  const weekEnd = weekEndOf(weekStart);
  return bleachers
    .flatMap((b) => tripsForBleacher(b, weekStart, weekEnd))
    .sort(
      (x, y) =>
        (x.bleacherNumber ?? Number.MAX_SAFE_INTEGER) -
          (y.bleacherNumber ?? Number.MAX_SAFE_INTEGER) ||
        x.availableFrom.localeCompare(y.availableFrom),
    );
}
