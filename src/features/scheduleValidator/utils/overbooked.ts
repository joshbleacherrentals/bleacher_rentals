import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";

/**
 * Overbooking: one bleacher on two events whose days overlap. An event's days run from its start
 * date to its end date, both included, so two events that share even one day clash, while one that
 * ends the day before the next starts does not. Pure: dates are "YYYY-MM-DD" strings, which compare
 * correctly as text.
 */

/** One bleacher selected on one event (a bleacher events row, with the event's dates). */
export type BleacherBooking = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherTypeName: string | null;
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
};

export type Conflict = {
  /** The event that starts first (the one listed first when they start the same day). */
  first: BleacherBooking;
  second: BleacherBooking;
  /** The days both events need the bleacher: from the later start to the earlier end. */
  overlapStart: string;
  overlapEnd: string;
};

export type OverbookedBleacher = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherTypeName: string | null;
  conflicts: Conflict[];
};

function conflictsFor(bookings: BleacherBooking[], weekStart: string, weekEnd: string): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const [first, second] = [bookings[i], bookings[j]];
      const overlapStart = first.startDate > second.startDate ? first.startDate : second.startDate;
      const overlapEnd = first.endDate < second.endDate ? first.endDate : second.endDate;
      if (overlapStart > overlapEnd) continue; // no shared day
      if (overlapStart > weekEnd || overlapEnd < weekStart) continue; // not in the selected week
      conflicts.push({ first, second, overlapStart, overlapEnd });
    }
  }
  return conflicts;
}

/**
 * The bleachers booked on two overlapping events where the overlap touches the week that starts on
 * `weekStart` (a Monday), ordered by bleacher number. A bleacher linked to the same event twice
 * counts that event once.
 */
export function findOverbookedBleachers(
  bookings: BleacherBooking[],
  weekStart: string,
): OverbookedBleacher[] {
  const weekEnd = weekEndOf(weekStart);

  const byBleacher = new Map<string, Map<string, BleacherBooking>>();
  for (const booking of bookings) {
    const events = byBleacher.get(booking.bleacherUuid) ?? new Map();
    if (!events.has(booking.eventId)) events.set(booking.eventId, booking);
    byBleacher.set(booking.bleacherUuid, events);
  }

  const overbooked: OverbookedBleacher[] = [];
  for (const events of byBleacher.values()) {
    const sorted = [...events.values()].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.eventName.localeCompare(b.eventName),
    );
    const conflicts = conflictsFor(sorted, weekStart, weekEnd);
    if (conflicts.length === 0) continue;
    const { bleacherUuid, bleacherNumber, bleacherTypeName } = sorted[0];
    overbooked.push({ bleacherUuid, bleacherNumber, bleacherTypeName, conflicts });
  }

  return overbooked.sort(
    (a, b) =>
      (a.bleacherNumber ?? Number.MAX_SAFE_INTEGER) - (b.bleacherNumber ?? Number.MAX_SAFE_INTEGER),
  );
}
