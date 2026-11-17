import type { Bleacher } from "@/features/dashboard/types";

/** A trip the Python service suggests: not in the database until a person accepts it. */
export type SuggestedTrip = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  fromAddressUuid: string | null;
  toAddressUuid: string | null;
  fromStreet: string;
  toStreet: string;
  fromEventUuid: string;
  toEventUuid: string;
  /** Where the draft would be dated: inside the selected week. */
  date: string;
  availableFrom: string;
  mustArriveBy: string;
};

/** Stable identity of a suggested trip, for keeping track of which ones were accepted. */
export function tripKey(trip: Pick<SuggestedTrip, "bleacherUuid" | "date" | "toAddressUuid">) {
  return `${trip.bleacherUuid}|${trip.date}|${trip.toAddressUuid ?? ""}`;
}

/**
 * The suggested trips by grid cell: "row:column" → trips. A bleacher on several events has several
 * rows, and the trip shows on each. `dates` are the grid's column dates. A trip whose date is not a
 * column, or that is not in the rows, is dropped.
 */
export function ghostsByCell(
  trips: SuggestedTrip[],
  rows: Bleacher[],
  dates: string[],
): Map<string, SuggestedTrip[]> {
  const colByDate = new Map(dates.map((d, i) => [d, i]));
  const rowsByBleacher = new Map<string, number[]>();
  rows.forEach((b, i) => {
    const list = rowsByBleacher.get(b.bleacherUuid) ?? [];
    list.push(i);
    rowsByBleacher.set(b.bleacherUuid, list);
  });

  const cells = new Map<string, SuggestedTrip[]>();
  for (const trip of trips) {
    const col = colByDate.get(trip.date);
    if (col === undefined) continue;
    for (const row of rowsByBleacher.get(trip.bleacherUuid) ?? []) {
      const key = `${row}:${col}`;
      cells.set(key, [...(cells.get(key) ?? []), trip]);
    }
  }
  return cells;
}

/** Whether `date` is a day of the week starting `weekStart` (a Monday): where trips may be created. */
export function isInWeek(date: string, weekStart: string): boolean {
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return date >= weekStart && date <= end.toISOString().slice(0, 10);
}

/** The trips that may be created for the week starting `weekStart`: only days inside it. */
export function tripsInWeek(trips: SuggestedTrip[], weekStart: string): SuggestedTrip[] {
  return trips.filter((t) => isInWeek(t.date, weekStart));
}

/** `trips` without the ones in `done`. */
export function withoutTrips(trips: SuggestedTrip[], done: SuggestedTrip[]): SuggestedTrip[] {
  const keys = new Set(done.map(tripKey));
  return trips.filter((t) => !keys.has(tripKey(t)));
}
