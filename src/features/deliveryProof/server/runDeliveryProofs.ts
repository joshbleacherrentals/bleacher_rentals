import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import type {
  LinxupClient,
  LinxupPosition,
  LinxupStop,
} from "@/features/analyticsMcp/server/linxup";
import { OFF_STATUSES } from "@/features/autoWorkTrackers/db/tripsNeeded";
import { SETTLE_MS } from "../logic/verdict";
import {
  LOOKBACK_MS,
  evidenceByImei,
  evidenceFromMs,
  lastReportByImei,
  proofRows,
  stopWindows,
  type BleacherMove,
  type CompletedTracker,
} from "../logic/proofRows";

type Admin = SupabaseClient<Database>;

const CHUNK = 100; // ids per `in` filter, to keep the request URL short
const chunks = <T>(list: T[]) =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) =>
    list.slice(i * CHUNK, i * CHUNK + CHUNK),
  );
const ms = (ts: string | null) => (ts ? Date.parse(ts) : null);

export type DeliveryProofSummary = {
  checked: number;
  verified: number;
  notFound: number;
  waiting: number;
  noGps: number;
  noLocation: number;
  linxupCalls: number;
};

/**
 * One run of the proof-of-delivery check (DeliveryProofs): the work trackers completed in the last
 * 7 days (and at least SETTLE_MS ago) that have no final proof yet, their hauled bleachers' GPS
 * stops and last positions from Linxup, and one upserted proof row each. When Linxup fails, nothing
 * is written: the next run tries again.
 */
export async function runDeliveryProofs(
  supabase: Admin,
  linxup: LinxupClient | null,
  nowMs: number = Date.now(),
): Promise<DeliveryProofSummary> {
  const fail = (what: string, e: { message: string } | null) => {
    if (e) throw new Error(`${what}: ${e.message}`);
  };

  // 1. Completed trackers in the window, without a final proof.
  const { data: completed, error: e1 } = await supabase
    .from("WorkTrackers")
    .select("id, bleacher_uuid, actual_bleacher_uuid, completed_at, dropoff_address_uuid")
    .eq("status", "completed")
    .gte("completed_at", new Date(nowMs - LOOKBACK_MS).toISOString())
    .lte("completed_at", new Date(nowMs - SETTLE_MS).toISOString());
  fail("Reading completed work trackers", e1);
  const ids = (completed ?? []).map((t) => t.id);

  const attemptsSoFar = new Map<string, number>();
  const finalIds = new Set<string>();
  for (const part of chunks(ids)) {
    const { data, error } = await supabase
      .from("DeliveryProofs")
      .select("work_tracker_uuid, final, attempts")
      .in("work_tracker_uuid", part);
    fail("Reading delivery proofs", error);
    for (const p of data ?? []) {
      attemptsSoFar.set(p.work_tracker_uuid, p.attempts);
      if (p.final) finalIds.add(p.work_tracker_uuid);
    }
  }
  const todo = (completed ?? []).filter((t) => !finalIds.has(t.id) && t.completed_at);

  // 2. Their drop-off coordinates, bleachers' GPS trackers and the bleachers' later moves.
  const addressIds = [
    ...new Set(todo.flatMap((t) => (t.dropoff_address_uuid ? [t.dropoff_address_uuid] : []))),
  ];
  const coords = new Map<string, { latitude: number; longitude: number }>();
  for (const part of chunks(addressIds)) {
    const { data, error } = await supabase
      .from("Addresses")
      .select("id, latitude, longitude")
      .in("id", part);
    fail("Reading drop-off addresses", error);
    for (const a of data ?? []) {
      if (a.latitude != null && a.longitude != null) {
        coords.set(a.id, { latitude: a.latitude, longitude: a.longitude });
      }
    }
  }

  const trackers: CompletedTracker[] = todo.map((t) => ({
    id: t.id,
    bleacherUuid: t.actual_bleacher_uuid ?? t.bleacher_uuid,
    completedMs: Date.parse(t.completed_at!),
    dropoff: (t.dropoff_address_uuid && coords.get(t.dropoff_address_uuid)) || null,
  }));
  const bleacherIds = [
    ...new Set(trackers.flatMap((t) => (t.bleacherUuid ? [t.bleacherUuid] : []))),
  ];

  const imeiByBleacher = new Map<string, string>();
  const moves: BleacherMove[] = [];
  // Moves dated from a day before the earliest completion: any later move is dated on or after it.
  const sinceDay = new Date(nowMs - LOOKBACK_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const part of chunks(bleacherIds)) {
    const { data: bleachers, error } = await supabase
      .from("Bleachers")
      .select("id, linxup_device_id")
      .in("id", part);
    fail("Reading bleachers", error);
    for (const b of bleachers ?? []) {
      if (b.linxup_device_id) imeiByBleacher.set(b.id, b.linxup_device_id);
    }

    const list = part.join(",");
    const { data: later, error: e2 } = await supabase
      .from("WorkTrackers")
      .select("id, bleacher_uuid, actual_bleacher_uuid, started_at, completed_at, status")
      .or(`bleacher_uuid.in.(${list}),actual_bleacher_uuid.in.(${list})`)
      .gte("date", sinceDay);
    fail("Reading the bleachers' later moves", e2);
    for (const m of later ?? []) {
      if (m.status && OFF_STATUSES.includes(m.status)) continue;
      moves.push({
        id: m.id,
        bleacherUuid: m.actual_bleacher_uuid ?? m.bleacher_uuid,
        startedMs: ms(m.started_at) ?? ms(m.completed_at),
      });
    }
  }

  // 3. GPS: only when a tracker to check has a GPS device. Linxup failing stops the run.
  let stops: LinxupStop[] = [];
  let positions: LinxupPosition[] = [];
  let linxupCalls = 0;
  const needsGps = trackers.some((t) => t.bleacherUuid && imeiByBleacher.has(t.bleacherUuid));
  if (needsGps) {
    if (!linxup) throw new Error("Linxup is not configured (LINXUP_API_HOST / LINXUP_API_TOKEN).");
    positions = await linxup.currentPositions();
    linxupCalls++;
    const from = evidenceFromMs(trackers);
    for (const [a, b] of from == null ? [] : stopWindows(from, nowMs)) {
      stops = stops.concat(await linxup.stops(a, b));
      linxupCalls++;
    }
  }

  // 4. Verdicts, upserted (one row per work tracker).
  const rows = proofRows({
    trackers,
    imeiByBleacher,
    moves,
    evidence: evidenceByImei(stops, positions),
    lastReport: lastReportByImei(positions),
    attemptsSoFar,
    nowMs,
  });
  for (const part of chunks(rows)) {
    const { error } = await supabase
      .from("DeliveryProofs")
      .upsert(part, { onConflict: "work_tracker_uuid" });
    fail("Saving delivery proofs", error);
  }

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    checked: rows.length,
    verified: count("verified"),
    notFound: count("not_found"),
    waiting: count("waiting"),
    noGps: count("no_gps"),
    noLocation: count("no_location"),
    linxupCalls,
  };
}
