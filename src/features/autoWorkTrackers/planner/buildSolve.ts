/**
 * Turns the week's planning inputs into the Python solver's request, and keeps what is needed to
 * read its answer back. Business rules live here, not in Python: which days a trip may happen,
 * which driver-days exist, and every place-to-place drive (Google's road time where known, else an
 * estimate, else a cautious unknown), and the hour on site for each teardown and setup. Pure.
 */

import { DateTime } from "luxon";
import type { NeededTrip } from "../utils/discoverTrips";
import {
  AVERAGE_SPEED_KMH,
  UNKNOWN_COST_M,
  UNKNOWN_MINUTES,
  estimateLeg,
  pairKey,
  roundPoint,
  type Pair,
  type Point,
  type RoadLeg,
} from "./roadTimes";
import type { SolveRequest } from "./solveContract";
import { siteWorkFor } from "../utils/siteWork";
import { DEFAULT_SETTINGS, type PlannerSettings } from "./settings";

/**
 * A contractor's trip cost with "Employees first": above any difference a route can make, so a
 * contractor only takes a trip no employee can fit, and below the solver's cost of leaving a trip
 * out (1,000,000,000), so the trip is still done.
 */
export const EMPLOYEES_FIRST_COST = 100_000_000;

/**
 * What a contractor taking a trip costs the solver, in the units of its costs (metres for the
 * distance objective, seconds for time): nothing when employees come first is off; the minutes of
 * extra driving an employee may do instead (as metres at the average speed when planning for
 * distance) with Prefer employees; EMPLOYEES_FIRST_COST with Employees first.
 */
export function contractorTripCost(s: PlannerSettings): number {
  if (s.employeePriority === "off") return 0;
  if (s.employeePriority === "first") return EMPLOYEES_FIRST_COST;
  return s.objective === "time"
    ? s.employeePriorityMinutes * 60
    : Math.round((s.employeePriorityMinutes / 60) * AVERAGE_SPEED_KMH * 1000);
}

export type UnplacedReason =
  | "no_window" // the bleacher is never free between the events (back to back)
  | "outside_week" // its free days all fall outside the week
  | "no_free_driver_day" // no driver had room on those days
  | "too_long_for_a_day"; // even alone, home → pickup → drop-off → home (with setup/teardown) is over the longest day

export type PlanTrip = NeededTrip & { pickup: Point | null; dropoff: Point | null };
/** A driver the model may use; a contractor is paid through a vendor, an employee is not. */
export type PlanDriver = { driverUuid: string; home: Point | null; contractor: boolean };

/** One drive as stored on a work tracker: metres and minutes, null when not known. */
export type LegValues = { meters: number | null; minutes: number | null };

export type PlanVehicle = {
  id: string;
  driverUuid: string;
  day: string;
  place: number;
  contractor: boolean;
};

export type BuiltSolve = {
  request: SolveRequest;
  /** The hour each driver-day starts, for the suggested times. */
  dayStartHour: number;
  vehicles: PlanVehicle[];
  /** By solver trip id (its index in `trips`). */
  trips: PlanTrip[];
  tripPlaces: { pickup: number; dropoff: number }[];
  /** The drive between two places, as it will be stored. */
  leg: (from: number, to: number) => LegValues;
  /** Trips the solver was not asked about, with why. */
  unplaced: { trip: PlanTrip; reason: UnplacedReason }[];
};

/** The days a trip may happen inside the week (the bleacher is free), or why there are none. */
export function allowedDays(
  trip: NeededTrip,
  weekStart: string,
): { days: string[]; reason: UnplacedReason | null } {
  if (trip.earliestDay > trip.latestDay) return { days: [], reason: "no_window" };
  const weekEnd = DateTime.fromISO(weekStart).plus({ days: 6 }).toISODate()!;
  const first = trip.earliestDay > weekStart ? trip.earliestDay : weekStart;
  const last = trip.latestDay < weekEnd ? trip.latestDay : weekEnd;
  if (first > last) return { days: [], reason: "outside_week" };
  const days: string[] = [];
  for (let d = DateTime.fromISO(first); d.toISODate()! <= last; d = d.plus({ days: 1 })) {
    days.push(d.toISODate()!);
  }
  return { days, reason: null };
}

/** Every drive the solver may need, between known points: home → pickup, drop-off → pickup,
 * drop-off → home, and each trip's own haul. These are what to look up road times for. */
export function pairsToLookUp(drivers: PlanDriver[], trips: PlanTrip[]): Pair[] {
  const homes = drivers.map((d) => d.home).filter(Boolean) as Point[];
  const pickups = trips.map((t) => t.pickup).filter(Boolean) as Point[];
  const dropoffs = trips.map((t) => t.dropoff).filter(Boolean) as Point[];
  const pairs = new Map<string, Pair>();
  const add = (a: Point, b: Point) => {
    const [ra, rb] = [roundPoint(a), roundPoint(b)];
    if (ra[0] === rb[0] && ra[1] === rb[1]) return;
    pairs.set(pairKey(ra, rb), [ra, rb]);
  };
  for (const h of homes) for (const p of pickups) add(h, p);
  for (const d of dropoffs) for (const p of pickups) add(d, p);
  for (const d of dropoffs) for (const h of homes) add(d, h);
  for (const t of trips) if (t.pickup && t.dropoff) add(t.pickup, t.dropoff);
  return [...pairs.values()];
}

export function buildSolve(input: {
  trips: PlanTrip[];
  drivers: PlanDriver[];
  /** "driverUuid|YYYY-MM-DD" for days a driver cannot take a trip. */
  blocked: Set<string>;
  weekStart: string;
  roadLegs: Map<string, RoadLeg>;
  /** The Advanced settings (resolveSettings); the defaults when not given. */
  settings?: PlannerSettings;
}): BuiltSolve {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const byTime = settings.objective === "time";
  // Places: one per distinct known point; each unknown point is a place of its own.
  const places: (Point | null)[] = [];
  const known = new Map<string, number>();
  const placeOf = (p: Point | null): number => {
    if (!p) {
      places.push(null);
      return places.length - 1;
    }
    const r = roundPoint(p);
    const key = r.join(",");
    if (!known.has(key)) {
      known.set(key, places.length);
      places.push(r);
    }
    return known.get(key)!;
  };

  const unplaced: BuiltSolve["unplaced"] = [];
  const planned: { trip: PlanTrip; days: string[] }[] = [];
  for (const trip of input.trips) {
    const { days, reason } = allowedDays(trip, input.weekStart);
    if (reason) unplaced.push({ trip, reason });
    else planned.push({ trip, days });
  }

  const wantedDays = [...new Set(planned.flatMap((p) => p.days))].sort();
  const vehicles: PlanVehicle[] = [];
  for (const d of [...input.drivers].sort((a, b) => a.driverUuid.localeCompare(b.driverUuid))) {
    const home = placeOf(d.home);
    for (const day of wantedDays) {
      if (input.blocked.has(`${d.driverUuid}|${day}`)) continue;
      vehicles.push({
        id: `${d.driverUuid}|${day}`,
        driverUuid: d.driverUuid,
        day,
        place: home,
        contractor: d.contractor,
      });
    }
  }

  const trips = planned.map((p) => p.trip);
  const tripPlaces = trips.map((t) => ({ pickup: placeOf(t.pickup), dropoff: placeOf(t.dropoff) }));

  const leg = (i: number, j: number): LegValues & { clock: number; cost: number } => {
    if (i === j) return { meters: 0, minutes: 0, clock: 0, cost: 0 };
    const [a, b] = [places[i], places[j]];
    if (!a || !b)
      return { meters: null, minutes: null, clock: UNKNOWN_MINUTES, cost: UNKNOWN_COST_M };
    const road = input.roadLegs.get(pairKey(a, b));
    if (road?.found && road.meters != null && road.seconds != null) {
      const minutes = Math.round(road.seconds / 60);
      return {
        meters: road.meters,
        minutes,
        clock: minutes,
        cost: byTime ? road.seconds : road.meters,
      };
    }
    const est = estimateLeg(a, b);
    return { ...est, clock: est.minutes, cost: byTime ? est.minutes * 60 : est.meters };
  };

  const n = places.length;
  const minutes: number[][] = [];
  const costs: number[][] = [];
  for (let i = 0; i < n; i++) {
    minutes.push([]);
    costs.push([]);
    for (let j = 0; j < n; j++) {
      const l = leg(i, j);
      minutes[i].push(l.clock);
      costs[i].push(l.cost);
    }
  }

  return {
    request: {
      minutes,
      costs,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        home: v.place,
        trip_cost: v.contractor ? contractorTripCost(settings) : 0,
      })),
      trips: planned.map((p, k) => ({
        id: String(k),
        pickup: tripPlaces[k].pickup,
        dropoff: tripPlaces[k].dropoff,
        vehicles: vehicles.filter((v) => p.days.includes(v.day)).map((v) => v.id),
        pickup_minutes: siteWorkFor(trips[k]).teardown ? settings.teardownMinutes : 0,
        dropoff_minutes: siteWorkFor(trips[k]).setup ? settings.setupMinutes : 0,
      })),
      max_day_minutes: settings.maxDayMinutes,
      search_seconds: settings.searchSeconds,
    },
    dayStartHour: settings.dayStartHour,
    vehicles,
    trips,
    tripPlaces,
    leg: (i, j) => {
      const { meters, minutes } = leg(i, j);
      return { meters, minutes };
    },
    unplaced,
  };
}
