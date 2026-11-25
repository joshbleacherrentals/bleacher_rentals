import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PlannedTracker } from "./fromSolve";
import { siteWorkFor, type PlannedLine } from "../utils/siteWork";

/**
 * The local writes for a plan, in order: each work tracker (a trip's previous one first, so the
 * chain points backwards) as a "Trip" type, with Setup Required / Teardown Required ticked as
 * siteWorkFor says, then its line items (Hauling, Setup, Teardown). A tracker's pay is its line
 * items' total, as the work tracker modal sets it on save. One batch, written
 * to the local database; PowerSync uploads it. Each tracker is stamped with `autoKey` (the zone and
 * week, autoWorkTrackerKey) so the page can count and bulk-delete the model's drafts.
 */
export function planStatements(
  planned: PlannedTracker[],
  lines: PlannedLine[],
  tripTypeUuid: string | null,
  autoKey: string,
  newId: () => string = () => crypto.randomUUID(),
  now: string = new Date().toISOString(),
): CompiledQuery[] {
  const payOf = new Map<string, number>();
  for (const l of lines) {
    const cents = Math.round(l.qtyDecimal * l.unitAmtCents);
    payOf.set(l.workTrackerId, (payOf.get(l.workTrackerId) ?? 0) + cents);
  }
  const trackers = planned.map((p) => {
    const work = siteWorkFor(p.trip);
    return db
      .insertInto("WorkTrackers")
      .values({
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
        pay_cents: payOf.get(p.id) ?? null,
      })
      .compile();
  });
  const lineItems = lines.map((l) =>
    db
      .insertInto("WorkTrackerLineItems")
      .values({
        id: newId(),
        created_at: now,
        work_tracker_uuid: l.workTrackerId,
        type: l.type,
        qty_decimal: l.qtyDecimal,
        unit_amt_cents: l.unitAmtCents,
        description: l.description,
        is_automatically_managed: l.isAutomaticallyManaged ? 1 : 0,
      })
      .compile(),
  );
  return [...trackers, ...lineItems];
}
