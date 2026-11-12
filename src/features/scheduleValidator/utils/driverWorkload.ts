import { weekDays } from "@/features/autoWorkTrackers/utils/week";

/** A driver may drive at most this many hours in a day. More is an error. */
export const MAX_DRIVING_HOURS = 12;

/** A work tracker with a driver. `driveMinutes` is null when the trip has no drive time recorded. */
export type WorkloadTrip = {
  driverUuid: string;
  driverName: string;
  /** "YYYY-MM-DD" */
  date: string;
  driveMinutes: number | null;
};

export type WorkloadDay = {
  date: string;
  minutes: number;
  trips: number;
  /** Trips that day with no drive time, which add nothing to `minutes`. */
  missingDriveTime: number;
  overLimit: boolean;
};

export type DriverWorkload = {
  driverUuid: string;
  driverName: string;
  /** The seven days of the week, Monday first. */
  days: WorkloadDay[];
};

/**
 * Each driver's driving time and trip count for every day of the week beginning `weekStart` (a
 * Monday). Only drivers with a trip in the week get a row, ordered by name; trips outside the week
 * are ignored. Pure: no database, no clock.
 */
export function buildDriverWorkload(trips: WorkloadTrip[], weekStart: string): DriverWorkload[] {
  const dates = weekDays(weekStart);
  const byDriver = new Map<string, DriverWorkload>();

  for (const trip of trips) {
    if (!dates.includes(trip.date)) continue;
    let row = byDriver.get(trip.driverUuid);
    if (!row) {
      row = {
        driverUuid: trip.driverUuid,
        driverName: trip.driverName,
        days: dates.map((date) => ({
          date,
          minutes: 0,
          trips: 0,
          missingDriveTime: 0,
          overLimit: false,
        })),
      };
      byDriver.set(trip.driverUuid, row);
    }
    const day = row.days[dates.indexOf(trip.date)];
    day.trips += 1;
    if (trip.driveMinutes == null) day.missingDriveTime += 1;
    else day.minutes += trip.driveMinutes;
    day.overLimit = day.minutes > MAX_DRIVING_HOURS * 60;
  }

  return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

/** Minutes as hours to one decimal, without a pointless ".0": "8h", "7.5h". */
export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
