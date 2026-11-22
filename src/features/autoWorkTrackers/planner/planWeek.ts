import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import { fetchDriverPaymentData } from "@/app/team/_lib/db";
import type { DriverPaymentData } from "@/features/workTrackers/util";
import { planHaulingLines } from "../utils/haulingLineItems";
import { buildSolve, pairsToLookUp, type UnplacedReason } from "./buildSolve";
import { readSolve } from "./fromSolve";
import { withoutDuplicates } from "./duplicates";
import { loadPlanningInputs } from "./loadInputs";
import { pairKey, type Pair, type RoadLeg } from "./roadTimes";
import { callSolve, type SolveResponse } from "./solveContract";
import { planStatements } from "./writePlan";

export type PlanWeekResult = {
  created: number;
  driverDays: number;
  bleachers: number;
  /** Trips left out because a work tracker already makes them (re-run protection). */
  alreadyPlanned: number;
  unplaced: { reason: UnplacedReason }[];
  /** Where the run's road legs came from. */
  road: { google: number; cached: number; estimated: number };
  /** Work trackers that got a Hauling line (the driver has pay set up and the haul is known). */
  withHauling: number;
};

/** Road times for the pairs, from the server (RouteCache, then Google). Missing pairs are estimated. */
async function fetchRoadTimes(
  pairs: Pair[],
): Promise<{ legs: Map<string, RoadLeg>; google: number; cached: number }> {
  if (pairs.length === 0) return { legs: new Map(), google: 0, cached: 0 };
  try {
    const res = await fetch("/api/auto-work-trackers/road-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs: pairs.map(([a, b]) => [a[0], a[1], b[0], b[1]]) }),
    });
    if (!res.ok) return { legs: new Map(), google: 0, cached: 0 };
    const body = (await res.json()) as {
      legs: Record<string, RoadLeg>;
      google: number;
      cached: number;
    };
    return { legs: new Map(Object.entries(body.legs)), google: body.google, cached: body.cached };
  } catch {
    return { legs: new Map(), google: 0, cached: 0 };
  }
}

/** Each driver's pay set-up, loaded the way the work tracker modal loads it. */
async function loadPay(
  driverUuids: string[],
  supabase: SupabaseClient<Database>,
): Promise<Map<string, DriverPaymentData>> {
  if (driverUuids.length === 0) return new Map();
  const drivers = await typedGetAll(
    db.selectFrom("Drivers").select(["id", "user_uuid"]).where("id", "in", driverUuids).compile(),
    expect<{ id: string; user_uuid: string | null }>(),
  );
  const entries = await Promise.all(
    drivers
      .filter((d) => d.user_uuid)
      .map(
        async (d) =>
          [d.id, await fetchDriverPaymentData(d.user_uuid!, supabase)] as [
            string,
            DriverPaymentData,
          ],
      ),
  );
  return new Map(entries);
}

let running = false;

/**
 * Creates the zone's work trackers for the week. TypeScript does all of it except the route
 * solving: read the inputs from the local database, look up road times (server), ask the Python
 * solver to place the trips (pure: it only does the maths), then write the work trackers, their
 * Hauling line items and pay to the local database in one batch (PowerSync uploads it). A second
 * run while one is going is refused, and trips a work tracker already makes are left out.
 */
export async function planWeek(input: {
  zoneId: string;
  weekStart: string;
  tz: string;
  supabase: SupabaseClient<Database>;
}): Promise<PlanWeekResult> {
  if (running) throw new Error("Work trackers are already being created.");
  running = true;
  try {
    const inputs = await loadPlanningInputs(input.zoneId, input.weekStart);
    const pairs = pairsToLookUp(inputs.drivers, inputs.trips);
    const road = await fetchRoadTimes(pairs);
    const answered = pairs.filter(([a, b]) => road.legs.get(pairKey(a, b))?.found).length;

    const built = buildSolve({
      trips: inputs.trips,
      drivers: inputs.drivers,
      blocked: inputs.blocked,
      weekStart: input.weekStart,
      roadLegs: road.legs,
    });
    const response: SolveResponse =
      built.request.trips.length > 0
        ? await callSolve(built.request)
        : { routes: [], unplaced: [] };
    const read = readSolve(built, response, input.tz);
    const { keep, skipped } = withoutDuplicates(read.planned, inputs.existing);

    const pay = await loadPay([...new Set(keep.map((p) => p.driverUuid))], input.supabase);
    const lines = planHaulingLines(
      keep.map((p) => ({
        workTrackerId: p.id,
        driverUuid: p.driverUuid,
        haulDistanceMeters: p.haul.meters,
        haulDriveSeconds: p.haul.minutes != null ? p.haul.minutes * 60 : null,
      })),
      pay,
    );
    await typedExecuteBatch(planStatements(keep, lines));

    return {
      created: keep.length,
      driverDays: new Set(keep.map((p) => `${p.driverUuid}|${p.date}`)).size,
      bleachers: new Set(keep.map((p) => p.trip.bleacherUuid)).size,
      alreadyPlanned: skipped.length,
      unplaced: read.unplaced.map((u) => ({ reason: u.reason })),
      road: { google: road.google, cached: road.cached, estimated: pairs.length - answered },
      withHauling: lines.length,
    };
  } finally {
    running = false;
  }
}
