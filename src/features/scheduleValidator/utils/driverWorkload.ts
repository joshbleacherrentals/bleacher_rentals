import { weekDays } from "@/features/autoWorkTrackers/utils/week";

/** A driver may drive at most this many hours in a day. More is an error. */
export const MAX_DRIVING_HOURS = 12;

/**
 * A work tracker with a driver. `driveMinutes` is the haul (pickup to drop-off), null when the trip has
 * no drive time recorded. `deadheadMinutes` is the empty driving it carries: to its pickup (from home
 * or the previous drop-off) plus, on the day's last trip, the drive home. Missing counts as none.
 */
export type WorkloadTrip = {
  driverUuid: string;
  driverName: string;
  /** "YYYY-MM-DD" */
  date: string;
  driveMinutes: number | null;
  deadheadMinutes?: number | null;
  /** The same legs' distances, in metres; missing counts as none. */
  haulMeters?: number | null;
  deadheadMeters?: number | null;
};

export type WorkloadDay = {
  date: string;
  /** All driving that day: hauling plus deadhead. The 12-hour limit is on this. */
  minutes: number;
  haulMinutes: number;
  deadheadMinutes: number;
  /** All distance that day: hauling plus deadhead, in metres. */
  meters: number;
  haulMeters: number;
  deadheadMeters: number;
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
 * Each driver's driving time (hauling, deadhead and their total) and trip count for every day of the week beginning `weekStart` (a
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
          haulMinutes: 0,
          deadheadMinutes: 0,
          meters: 0,
          haulMeters: 0,
          deadheadMeters: 0,
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
    else day.haulMinutes += trip.driveMinutes;
    day.deadheadMinutes += trip.deadheadMinutes ?? 0;
    day.minutes = day.haulMinutes + day.deadheadMinutes;
    day.haulMeters += trip.haulMeters ?? 0;
    day.deadheadMeters += trip.deadheadMeters ?? 0;
    day.meters = day.haulMeters + day.deadheadMeters;
    day.overLimit = day.minutes > MAX_DRIVING_HOURS * 60;
  }

  return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

/** Metres as whole kilometres: "412km". */
export function formatKm(meters: number): string {
  return `${Math.round(meters / 1000).toLocaleString()}km`;
}

/** Minutes as hours to one decimal, without a pointless ".0": "8h", "7.5h". */
export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
