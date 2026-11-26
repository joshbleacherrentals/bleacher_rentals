/**
 * Turns the cron's inputs into DeliveryProofs rows: for each completed work tracker, its hauled
 * bleacher's GPS reports, the start of that bleacher's next move, and the verdict. Pure.
 */

import type { LinxupPosition, LinxupStop } from "@/features/analyticsMcp/server/linxup";
import { LINXUP_STOPS_MAX_MS } from "@/features/analyticsMcp/server/linxup";
import { EARLY_MS, deliveryVerdict, type Evidence, type ProofStatus } from "./verdict";

/** How far back the cron looks for completed work trackers. */
export const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export type CompletedTracker = {
  id: string;
  /** The bleacher actually hauled: actual_bleacher_uuid, else bleacher_uuid. */
  bleacherUuid: string | null;
  completedMs: number;
  dropoff: { latitude: number; longitude: number } | null;
};

export type BleacherMove = {
  id: string;
  bleacherUuid: string | null;
  /** When the move began: started_at, else completed_at (ms); null when neither is set. */
  startedMs: number | null;
};

export type ProofRow = {
  work_tracker_uuid: string;
  status: ProofStatus;
  final: boolean;
  checked_at: string;
  attempts: number;
  bleacher_uuid: string | null;
  imei: string | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  evidence_kind: "stop" | "position" | null;
  evidence_at: string | null;
  evidence_latitude: number | null;
  evidence_longitude: number | null;
  distance_meters: number | null;
  evidence_place: string | null;
  evidence_until: string | null;
  gps_last_report_at: string | null;
  window_end: string | null;
};

/** When the bleacher's next move after this delivery began, or null if it has not moved again. */
export function nextMoveMs(tracker: CompletedTracker, moves: BleacherMove[]): number | null {
  const later = moves
    .filter(
      (m) =>
        m.id !== tracker.id &&
        m.bleacherUuid != null &&
        m.bleacherUuid === tracker.bleacherUuid &&
        m.startedMs != null &&
        m.startedMs > tracker.completedMs,
    )
    .map((m) => m.startedMs!);
  return later.length ? Math.min(...later) : null;
}

/** The /stops calls needed to cover from..to, each at most 48 hours. */
export function stopWindows(fromMs: number, toMs: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = fromMs; a < toMs; a += LINXUP_STOPS_MAX_MS) {
    out.push([a, Math.min(a + LINXUP_STOPS_MAX_MS, toMs)]);
  }
  return out;
}

/** Where the GPS reports for the trackers start: an hour before the earliest completion. */
export function evidenceFromMs(trackers: CompletedTracker[]): number | null {
  if (trackers.length === 0) return null;
  return Math.min(...trackers.map((t) => t.completedMs)) - EARLY_MS;
}

/** A stop's place as Linxup names it: its geofence, else "street, city". */
export function stopPlace(s: Pick<LinxupStop, "geofenceName" | "street" | "city">): string | null {
  if (s.geofenceName) return s.geofenceName;
  return [s.street, s.city].filter(Boolean).join(", ") || null;
}

/** Each tracker's last report, by IMEI (epoch ms), from the current positions. */
export function lastReportByImei(positions: LinxupPosition[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of positions) out.set(p.imei, Math.max(out.get(p.imei) ?? 0, p.date));
  return out;
}

/** Each tracker's reports, by IMEI: its stops (deduplicated) and its last position. */
export function evidenceByImei(
  stops: LinxupStop[],
  positions: LinxupPosition[],
): Map<string, Evidence[]> {
  const out = new Map<string, Evidence[]>();
  const seen = new Set<string>();
  const add = (imei: string, e: Evidence) => {
    if (!out.has(imei)) out.set(imei, []);
    out.get(imei)!.push(e);
  };
  for (const s of stops) {
    const key = `${s.imei}|${s.beginDate}`; // calls overlap, and each returns stops begun before it
    if (seen.has(key)) continue;
    seen.add(key);
    add(s.imei, {
      kind: "stop",
      latitude: s.latitude,
      longitude: s.longitude,
      fromMs: s.beginDate,
      toMs: s.endDate,
      place: stopPlace(s),
    });
  }
  for (const p of positions) {
    add(p.imei, {
      kind: "position",
      latitude: p.latitude,
      longitude: p.longitude,
      fromMs: p.date,
      toMs: p.date,
    });
  }
  return out;
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

/** The proof row for each tracker. `attempts` counts this check too. */
export function proofRows(input: {
  trackers: CompletedTracker[];
  imeiByBleacher: Map<string, string>;
  moves: BleacherMove[];
  evidence: Map<string, Evidence[]>;
  /** Each tracker's last report (epoch ms), from the current positions. */
  lastReport?: Map<string, number>;
  attemptsSoFar: Map<string, number>;
  nowMs: number;
}): ProofRow[] {
  return input.trackers.map((t) => {
    const imei = (t.bleacherUuid && input.imeiByBleacher.get(t.bleacherUuid)) || null;
    const next = nextMoveMs(t, input.moves);
    const verdict = imei
      ? deliveryVerdict({
          dropoff: t.dropoff,
          completedMs: t.completedMs,
          nextMoveMs: next,
          nowMs: input.nowMs,
          evidence: input.evidence.get(imei) ?? [],
        })
      : t.dropoff
        ? { status: "no_gps" as const, final: true, best: null }
        : { status: "no_location" as const, final: true, best: null };
    const best = verdict.best;
    return {
      work_tracker_uuid: t.id,
      status: verdict.status,
      final: verdict.final,
      checked_at: iso(input.nowMs)!,
      attempts: (input.attemptsSoFar.get(t.id) ?? 0) + 1,
      bleacher_uuid: t.bleacherUuid,
      imei,
      dropoff_latitude: t.dropoff?.latitude ?? null,
      dropoff_longitude: t.dropoff?.longitude ?? null,
      evidence_kind: best?.kind ?? null,
      evidence_at: best ? iso(best.fromMs) : null,
      evidence_latitude: best?.latitude ?? null,
      evidence_longitude: best?.longitude ?? null,
      distance_meters: best?.meters ?? null,
      evidence_place: best?.place ?? null,
      evidence_until: best?.kind === "stop" ? iso(best.toMs) : null,
      gps_last_report_at: imei ? iso(input.lastReport?.get(imei) ?? null) : null,
      window_end: iso(next),
    };
  });
}
