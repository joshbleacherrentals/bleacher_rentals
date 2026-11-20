import { weekDays } from "@/features/autoWorkTrackers/utils/week";

/**
 * The driver-availability check, as a week grid: for each driver, each day, whether they marked it
 * unavailable and which trips they are scheduled on. A day with both is a conflict. Pure: dates are
 * "YYYY-MM-DD" strings, no database, no clock.
 */

/** A work tracker that has a driver. */
export type AvailabilityTrip = {
  workTrackerId: string;
  date: string;
  driverUuid: string;
  driverName: string;
  fromStreet: string | null;
  toStreet: string | null;
};

/** A date a driver said they cannot work (a DriverUnavailability row). */
export type Unavailability = { driverUuid: string; driverName: string; date: string };

export type AvailabilityDay = {
  date: string;
  unavailable: boolean;
  trips: AvailabilityTrip[];
  /** Scheduled on a day they marked unavailable. */
  conflict: boolean;
};

export type DriverAvailability = {
  driverUuid: string;
  driverName: string;
  /** The seven days of the week, Monday first. */
  days: AvailabilityDay[];
  /** No day of the week is a conflict. */
  ok: boolean;
};

/**
 * Every driver with a trip or an unavailable day in the week beginning `weekStart` (a Monday), ordered
 * by name. Trips and unavailability outside the week are ignored.
 */
export function buildDriverAvailability(
  trips: AvailabilityTrip[],
  unavailability: Unavailability[],
  weekStart: string,
): DriverAvailability[] {
  const dates = weekDays(weekStart);
  const byDriver = new Map<string, DriverAvailability>();

  const rowFor = (driverUuid: string, driverName: string) => {
    let row = byDriver.get(driverUuid);
    if (!row) {
      row = {
        driverUuid,
        driverName,
        days: dates.map((date) => ({ date, unavailable: false, trips: [], conflict: false })),
        ok: true,
      };
      byDriver.set(driverUuid, row);
    }
    return row;
  };

  for (const u of unavailability) {
    const i = dates.indexOf(u.date);
    if (i >= 0) rowFor(u.driverUuid, u.driverName).days[i].unavailable = true;
  }
  for (const trip of trips) {
    const i = dates.indexOf(trip.date);
    if (i >= 0) rowFor(trip.driverUuid, trip.driverName).days[i].trips.push(trip);
  }

  for (const row of byDriver.values()) {
    for (const day of row.days) {
      day.trips.sort((a, b) => a.workTrackerId.localeCompare(b.workTrackerId));
      day.conflict = day.unavailable && day.trips.length > 0;
    }
    row.ok = row.days.every((d) => !d.conflict);
  }

  return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}
