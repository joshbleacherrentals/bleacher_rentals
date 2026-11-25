import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import { fetchDriverPaymentData } from "@/app/team/_lib/db";
import type { DriverPaymentData } from "@/features/workTrackers/util";
import { planHaulingLines } from "../utils/haulingLineItems";
import { autoWorkTrackerKey } from "../utils/autoWorkTrackerKey";
import {
  planSiteWorkLines,
  siteWorkFor,
  type PlannedLine,
  type SiteWorkRates,
} from "../utils/siteWork";
import { buildSolve, pairsToLookUp, type UnplacedReason } from "./buildSolve";
import { readSolve } from "./fromSolve";
import { withoutDuplicates } from "./duplicates";
import { loadPlanningInputs } from "./loadInputs";
import { pairKey, type Pair, type RoadLeg } from "./roadTimes";
import { callSolve, type SolveResponse } from "./solveContract";
import { planRows, rowStatements } from "./writePlan";
import { runStatements } from "./runLog";
import { resolveSettings, type PlannerSettings, type SettingsRow } from "./settings";
import { settingsQuery } from "../db/settings";

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
  /** Setup and Teardown line items added (an hour each, at the driver's rate). */
  setups: number;
  teardowns: number;
  /** The Advanced settings the run planned with. */
  settings: PlannerSettings;
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

/**
 * Each driver's pay set-up, loaded the way the work tracker modal loads it, and their setup and
 * teardown rates (the modal's Setup / Teardown lines).
 */
async function loadPay(
  driverUuids: string[],
  supabase: SupabaseClient<Database>,
): Promise<{ pay: Map<string, DriverPaymentData>; siteRates: Map<string, SiteWorkRates> }> {
  if (driverUuids.length === 0) return { pay: new Map(), siteRates: new Map() };
  const drivers = await typedGetAll(
    db
      .selectFrom("Drivers")
      .select(["id", "user_uuid", "setup_cents", "teardown_cents"])
      .where("id", "in", driverUuids)
      .compile(),
    expect<{
      id: string;
      user_uuid: string | null;
      setup_cents: number | null;
      teardown_cents: number | null;
    }>(),
  );
  const siteRates = new Map(
    drivers.map((d) => [d.id, { setupCents: d.setup_cents, teardownCents: d.teardown_cents }]),
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
  return { pay: new Map(entries), siteRates };
}

let running = false;

/**
 * Creates the zone's work trackers for the week. TypeScript does all of it except the route
 * solving: read the inputs from the local database, look up road times (server), ask the Python
 * solver to place the trips (pure: it only does the maths), then write the work trackers, their
 * Hauling, Setup and Teardown line items and pay to the local database in one batch (PowerSync uploads it). A second
 * run while one is going is refused, and trips a work tracker already makes are left out.
 */
export async function planWeek(input: {
  zoneId: string;
  weekStart: string;
  tz: string;
  supabase: SupabaseClient<Database>;
  /** Who pressed Create (Users.id), recorded on the run. */
  userUuid: string | null;
}): Promise<PlanWeekResult> {
  if (running) throw new Error("Work trackers are already being created.");
  running = true;
  try {
    const [inputs, settingsRows] = await Promise.all([
      loadPlanningInputs(input.zoneId, input.weekStart),
      typedGetAll(settingsQuery(), expect<SettingsRow>()),
    ]);
    const settings = resolveSettings(settingsRows[0] ?? null);
    const pairs = pairsToLookUp(inputs.drivers, inputs.trips);
    const road = await fetchRoadTimes(pairs);
    const answered = pairs.filter(([a, b]) => road.legs.get(pairKey(a, b))?.found).length;

    const built = buildSolve({
      trips: inputs.trips,
      drivers: inputs.drivers,
      blocked: inputs.blocked,
      weekStart: input.weekStart,
      roadLegs: road.legs,
      settings,
    });
    const response: SolveResponse =
      built.request.trips.length > 0
        ? await callSolve(built.request)
        : { routes: [], unplaced: [] };
    const read = readSolve(built, response, input.tz);
    const { keep, skipped } = withoutDuplicates(read.planned, inputs.existing);

    const { pay, siteRates } = await loadPay(
      [...new Set(keep.map((p) => p.driverUuid))],
      input.supabase,
    );
    const hauling = planHaulingLines(
      keep.map((p) => ({
        workTrackerId: p.id,
        driverUuid: p.driverUuid,
        haulDistanceMeters: p.haul.meters,
        haulDriveSeconds: p.haul.minutes != null ? p.haul.minutes * 60 : null,
      })),
      pay,
    );
    const siteWork = planSiteWorkLines(
      keep.map((p) => ({
        workTrackerId: p.id,
        driverUuid: p.driverUuid,
        work: siteWorkFor(p.trip),
      })),
      siteRates,
    );
    const lines: PlannedLine[] = [
      ...hauling.map((h) => ({
        workTrackerId: h.workTrackerId,
        type: "hauling" as const,
        qtyDecimal: 1,
        unitAmtCents: h.unitAmtCents,
        description: h.description,
        isAutomaticallyManaged: false,
      })),
      ...siteWork,
    ];
    const autoKey = autoWorkTrackerKey(input.zoneId, input.weekStart);
    const rows = planRows(keep, lines, inputs.tripTypeUuid, autoKey);

    const result: PlanWeekResult = {
      created: keep.length,
      driverDays: new Set(keep.map((p) => `${p.driverUuid}|${p.date}`)).size,
      bleachers: new Set(keep.map((p) => p.trip.bleacherUuid)).size,
      alreadyPlanned: skipped.length,
      unplaced: read.unplaced.map((u) => ({ reason: u.reason })),
      road: { google: road.google, cached: road.cached, estimated: pairs.length - answered },
      withHauling: hauling.length,
      setups: siteWork.filter((l) => l.type === "setup").length,
      teardowns: siteWork.filter((l) => l.type === "teardown").length,
      settings,
    };

    // The run and a snapshot of every tracker it creates, in the same batch as the trackers, so the
    // log can never disagree with what was written.
    const { settings: used, ...totals } = result;
    const log = runStatements(
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        createdByUserUuid: input.userUuid,
        zoneUuid: input.zoneId,
        weekStart: input.weekStart,
        autoKey,
        settings: used,
        result: totals,
      },
      rows,
    );
    await typedExecuteBatch([log.run, ...rowStatements(rows), ...log.trips]);

    return result;
  } finally {
    running = false;
  }
}
