/**
 * Reads the Python solver's answer back into planned work trackers: each placed trip with its
 * driver and day, its place in the day and the trip it follows, suggested times and every leg it
 * carries. Pure.
 */

import { DateTime } from "luxon";
import type { BuiltSolve, LegValues, PlanTrip, UnplacedReason } from "./buildSolve";
import type { SolveResponse } from "./solveContract";

/** Suggested times count from here, in the zone's local time. */
export const DAY_START_HOUR = 7;

export type PlannedTracker = {
  id: string;
  trip: PlanTrip;
  driverUuid: string;
  date: string;
  sequence: number;
  /** The planned tracker this one drives on from, straight from its drop-off; null: from home. */
  previousId: string | null;
  plannedPickupAt: string;
  plannedDropoffAt: string;
  haul: LegValues;
  deadheadIn: LegValues;
  /** The drive home; only on the day's last trip. */
  returnHome: LegValues | null;
};

export type ReadPlan = {
  planned: PlannedTracker[];
  unplaced: { trip: PlanTrip; reason: UnplacedReason }[];
};

const SOLVER_REASON = {
  no_vehicle: "no_free_driver_day",
  no_room: "no_free_driver_day",
  too_long_for_a_day: "too_long_for_a_day",
} as const satisfies Record<string, UnplacedReason>;

export function readSolve(
  built: BuiltSolve,
  response: SolveResponse,
  tz: string,
  newId: () => string = () => crypto.randomUUID(),
): ReadPlan {
  const vehicles = new Map(built.vehicles.map((v) => [v.id, v]));
  const planned: PlannedTracker[] = [];

  for (const route of [...response.routes].sort((a, b) => a.vehicle.localeCompare(b.vehicle))) {
    const vehicle = vehicles.get(route.vehicle);
    if (!vehicle) continue;
    const start = DateTime.fromISO(vehicle.day, { zone: tz }).set({ hour: DAY_START_HOUR });
    let previous: PlannedTracker | null = null;
    let cameFrom = vehicle.place;

    route.stops.forEach((stop, i) => {
      const k = Number(stop.trip);
      const places = built.tripPlaces[k];
      const last = i === route.stops.length - 1;
      const tracker: PlannedTracker = {
        id: newId(),
        trip: built.trips[k],
        driverUuid: vehicle.driverUuid,
        date: vehicle.day,
        sequence: i + 1,
        previousId: previous?.id ?? null,
        plannedPickupAt: start.plus({ minutes: stop.pickup_minute }).toISO()!,
        plannedDropoffAt: start.plus({ minutes: stop.dropoff_minute }).toISO()!,
        haul: built.leg(places.pickup, places.dropoff),
        deadheadIn: built.leg(cameFrom, places.pickup),
        returnHome: last ? built.leg(places.dropoff, vehicle.place) : null,
      };
      planned.push(tracker);
      previous = tracker;
      cameFrom = places.dropoff;
    });
  }

  return {
    planned,
    unplaced: [
      ...built.unplaced,
      ...response.unplaced.map((u) => ({
        trip: built.trips[Number(u.trip)],
        reason: SOLVER_REASON[u.reason],
      })),
    ],
  };
}
