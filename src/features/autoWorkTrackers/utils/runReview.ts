/**
 * Compares what a model run planned with what became of it: each trip's snapshot (as the model
 * wrote it) against its work tracker now. Pure.
 */

import type { TripSnapshot } from "../planner/runLog";

export type TripState = "kept" | "edited" | "deleted";
export type FieldChange = { field: string; label: string; before: string; after: string };
export type LineItemLike = {
  type: string | null;
  qty_decimal: number | null;
  unit_amt_cents: number | null;
};

/** Fields that change by design, not because someone disagreed with the plan. */
const IGNORED = new Set(["id", "status", "auto_work_tracker_id"]);

const LABELS: Record<string, string> = {
  bleacher_uuid: "Bleacher",
  date: "Day",
  driver_uuid: "Driver",
  work_tracker_type_uuid: "Type",
  pickup_address_uuid: "Pickup",
  dropoff_address_uuid: "Drop-off",
  previous_work_tracker_uuid: "Trip before it",
  planned_pickup_at: "Suggested pickup time",
  planned_dropoff_at: "Suggested drop-off time",
  distance_meters: "Haul distance",
  drive_minutes: "Haul drive time",
  deadhead_in_distance_meters: "Deadhead distance",
  deadhead_in_drive_minutes: "Deadhead drive time",
  return_home_distance_meters: "Drive home distance",
  return_home_drive_minutes: "Drive home time",
  teardown_required: "Teardown required",
  setup_required: "Setup required",
  pay_cents: "Pay",
};

export function fieldLabel(field: string): string {
  return LABELS[field] ?? field.replace(/_/g, " ");
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Milliseconds for a timestamp as the app or Postgres writes it ("… 11:10:00+00"), else NaN. */
export function parseTimestamp(s: string): number {
  return Date.parse(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
}

/** A value as compared: timestamps by instant, booleans as 0/1, blanks as null. */
export function normalize(v: unknown): string | number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  const s = String(v);
  if (TIMESTAMP.test(s)) {
    const ms = parseTimestamp(s);
    if (!Number.isNaN(ms)) return ms;
  }
  return s;
}

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));

const lineKey = (l: LineItemLike) =>
  `${l.type ?? "custom"}|${Number(l.qty_decimal ?? 0)}|${Number(l.unit_amt_cents ?? 0)}`;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** "Hauling $30.60, Setup $55.00" for a list of line items. */
export function describeLines(lines: LineItemLike[]): string {
  if (lines.length === 0) return "none";
  return lines
    .map((l) => {
      const total = Math.round(Number(l.qty_decimal ?? 0) * Number(l.unit_amt_cents ?? 0));
      const type = l.type ?? "custom";
      return `${type.charAt(0).toUpperCase()}${type.slice(1).replace(/_/g, " ")} ${money(total)}`;
    })
    .join(", ");
}

/**
 * What became of one planned trip: deleted (its tracker is gone), edited (any field the model wrote,
 * or its line items, differ now), or kept. Status is left out: a trip being released and done is
 * the plan working, not a change to it.
 */
export function reviewTrip(
  snapshot: TripSnapshot,
  current: Record<string, unknown> | null,
  currentLines: LineItemLike[],
): { state: TripState; changes: FieldChange[] } {
  if (!current) return { state: "deleted", changes: [] };
  const changes: FieldChange[] = [];
  for (const [field, before] of Object.entries(snapshot.tracker)) {
    if (IGNORED.has(field)) continue;
    const after = current[field];
    if (normalize(before) !== normalize(after)) {
      changes.push({ field, label: fieldLabel(field), before: show(before), after: show(after) });
    }
  }
  const planned = (snapshot.lineItems as LineItemLike[]).map(lineKey).sort();
  const now = currentLines.map(lineKey).sort();
  if (planned.join(";") !== now.join(";")) {
    changes.push({
      field: "line_items",
      label: "Line items",
      before: describeLines(snapshot.lineItems as LineItemLike[]),
      after: describeLines(currentLines),
    });
  }
  return { state: changes.length > 0 ? "edited" : "kept", changes };
}

/**
 * The week's work trackers around a run: made by hand before it, made by the run, and made by hand
 * after it.
 */
export function weekTimeline(
  trackers: { id: string; created_at: string | null }[],
  runCreatedAt: string,
  runTrackerIds: Set<string>,
): { before: number; model: number; after: number } {
  const at = parseTimestamp(runCreatedAt);
  let before = 0;
  let after = 0;
  for (const t of trackers) {
    if (runTrackerIds.has(t.id)) continue;
    const created = t.created_at ? parseTimestamp(t.created_at) : NaN;
    if (!Number.isNaN(created) && created > at) after++;
    else before++;
  }
  return { before, model: runTrackerIds.size, after };
}
