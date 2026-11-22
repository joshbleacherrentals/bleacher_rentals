import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PlannedTracker } from "./fromSolve";
import type { PlannedHaulingLine } from "../utils/haulingLineItems";

/**
 * The local writes for a plan, in order: each work tracker (a trip's previous one first, so the
 * chain points backwards) as a "Trip" type, then its Hauling line item. A tracker's pay is its line items' total,
 * so it is set to its Hauling line here, as the work tracker modal does on save. One batch, written
 * to the local database; PowerSync uploads it.
 */
export function planStatements(
  planned: PlannedTracker[],
  lines: PlannedHaulingLine[],
  tripTypeUuid: string | null,
  newId: () => string = () => crypto.randomUUID(),
  now: string = new Date().toISOString(),
): CompiledQuery[] {
  const lineOf = new Map(lines.map((l) => [l.workTrackerId, l]));
  const trackers = planned.map((p) =>
    db
      .insertInto("WorkTrackers")
      .values({
        id: p.id,
        bleacher_uuid: p.trip.bleacherUuid,
        date: p.date,
        status: "draft",
        work_tracker_type_uuid: tripTypeUuid,
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
        pay_cents: lineOf.get(p.id)?.unitAmtCents ?? null,
      })
      .compile(),
  );
  const lineItems = lines.map((l) =>
    db
      .insertInto("WorkTrackerLineItems")
      .values({
        id: newId(),
        created_at: now,
        work_tracker_uuid: l.workTrackerId,
        type: "hauling",
        qty_decimal: 1,
        unit_amt_cents: l.unitAmtCents,
        description: l.description,
        is_automatically_managed: 0,
      })
      .compile(),
  );
  return [...trackers, ...lineItems];
}
