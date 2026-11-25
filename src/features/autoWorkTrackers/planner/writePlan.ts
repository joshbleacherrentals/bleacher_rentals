import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PlannedTracker } from "./fromSolve";
import { siteWorkFor, type PlannedLine } from "../utils/siteWork";

/** A work tracker the model creates, as the values its insert writes. */
function trackerRow(
  p: PlannedTracker,
  tripTypeUuid: string | null,
  autoKey: string,
  payCents: number | null,
) {
  const work = siteWorkFor(p.trip);
  return {
    id: p.id,
    bleacher_uuid: p.trip.bleacherUuid,
    date: p.date,
    status: "draft",
    work_tracker_type_uuid: tripTypeUuid,
    auto_work_tracker_id: autoKey,
    driver_uuid: p.driverUuid,
    pickup_address_uuid: p.trip.fromAddressUuid,
    dropoff_address_uuid: p.trip.toAddressUuid,
    previous_work_tracker_uuid: p.previousId,
    planned_pickup_at: p.plannedPickupAt,
    planned_dropoff_at: p.plannedDropoffAt,
    distance_meters: p.haul.meters,
    drive_minutes: p.haul.minutes,
    deadhead_in_distance_meters: p.deadheadIn.meters,
    deadhead_in_drive_minutes: p.deadheadIn.minutes,
    return_home_distance_meters: p.returnHome?.meters ?? null,
    return_home_drive_minutes: p.returnHome?.minutes ?? null,
    teardown_required: work.teardown ? 1 : 0,
    setup_required: work.setup ? 1 : 0,
    pay_cents: payCents,
  };
}

function lineItemRow(l: PlannedLine, id: string, now: string) {
  return {
    id,
    created_at: now,
    work_tracker_uuid: l.workTrackerId,
    type: l.type,
    qty_decimal: l.qtyDecimal,
    unit_amt_cents: l.unitAmtCents,
    description: l.description,
    is_automatically_managed: l.isAutomaticallyManaged ? 1 : 0,
  };
}

export type TrackerRow = ReturnType<typeof trackerRow>;
export type LineItemRow = ReturnType<typeof lineItemRow>;
export type PlanRows = { trackers: TrackerRow[]; lineItems: LineItemRow[] };

/**
 * The rows a plan writes: each work tracker (a trip's previous one first, so the chain points
 * backwards) as a "Trip" type, with Setup Required / Teardown Required ticked as siteWorkFor says,
 * then its line items (Hauling, Setup, Teardown). A tracker's pay is its line items' total, as the
 * work tracker modal sets it on save. Each tracker is stamped with `autoKey` (the zone and week,
 * autoWorkTrackerKey) so the page can count and bulk-delete the model's drafts. Pure.
 */
export function planRows(
  planned: PlannedTracker[],
  lines: PlannedLine[],
  tripTypeUuid: string | null,
  autoKey: string,
  newId: () => string = () => crypto.randomUUID(),
  now: string = new Date().toISOString(),
): PlanRows {
  const payOf = new Map<string, number>();
  for (const l of lines) {
    const cents = Math.round(l.qtyDecimal * l.unitAmtCents);
    payOf.set(l.workTrackerId, (payOf.get(l.workTrackerId) ?? 0) + cents);
  }
  return {
    trackers: planned.map((p) => trackerRow(p, tripTypeUuid, autoKey, payOf.get(p.id) ?? null)),
    lineItems: lines.map((l) => lineItemRow(l, newId(), now)),
  };
}

/** The inserts for a plan's rows: the work trackers, then their line items. */
export function rowStatements(rows: PlanRows): CompiledQuery[] {
  return [
    ...rows.trackers.map((t) => db.insertInto("WorkTrackers").values(t).compile()),
    ...rows.lineItems.map((l) => db.insertInto("WorkTrackerLineItems").values(l).compile()),
  ];
}

/** planRows written as one batch of local inserts; PowerSync uploads them. */
export function planStatements(
  planned: PlannedTracker[],
  lines: PlannedLine[],
  tripTypeUuid: string | null,
  autoKey: string,
  newId: () => string = () => crypto.randomUUID(),
  now: string = new Date().toISOString(),
): CompiledQuery[] {
  return rowStatements(planRows(planned, lines, tripTypeUuid, autoKey, newId, now));
}
