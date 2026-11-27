import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";

/**
 * The query behind fetchSharedAddressUuids: every reference to one of `ids` from anything other
 * than the work tracker `workTrackerUuid` itself.
 */
export function sharedAddressesQuery(ids: string[], workTrackerUuid: string) {
  return db
    .selectFrom("Events")
    .select("address_uuid as id")
    .where("address_uuid", "in", ids)
    .unionAll(db.selectFrom("Venues").select("address_uuid as id").where("address_uuid", "in", ids))
    .unionAll(
      db
        .selectFrom("Companies")
        .select("billing_address_uuid as id")
        .where("billing_address_uuid", "in", ids),
    )
    .unionAll(
      db
        .selectFrom("Companies")
        .select("shipping_address_uuid as id")
        .where("shipping_address_uuid", "in", ids),
    )
    .unionAll(
      db.selectFrom("Drivers").select("address_uuid as id").where("address_uuid", "in", ids),
    )
    .unionAll(
      db
        .selectFrom("MaintenanceEvents")
        .select("address_uuid as id")
        .where("address_uuid", "in", ids),
    )
    .unionAll(
      db.selectFrom("SalesOffices").select("address_uuid as id").where("address_uuid", "in", ids),
    )
    .unionAll(
      db
        .selectFrom("StorageLocations")
        .select("address_uuid as id")
        .where("address_uuid", "in", ids),
    )
    .unionAll(
      db.selectFrom("Vendors").select("address_uuid as id").where("address_uuid", "in", ids),
    )
    .unionAll(
      db
        .selectFrom("WorkTrackers")
        .select("pickup_address_uuid as id")
        .where("pickup_address_uuid", "in", ids)
        .where("id", "!=", workTrackerUuid),
    )
    .unionAll(
      db
        .selectFrom("WorkTrackers")
        .select("dropoff_address_uuid as id")
        .where("dropoff_address_uuid", "in", ids)
        .where("id", "!=", workTrackerUuid),
    )
    .compile();
}

/**
 * Which of a work tracker's addresses are also used by something else: an event, a venue, a
 * company, a driver, a repair, a sales office, a storage location, a vendor or another work
 * tracker. The auto planner gives a tracker the event's own address row, so editing that tracker's
 * address in place would move the event, its venue and every event at that venue too; saving
 * gives such a tracker its own copy instead (planWorkTrackerSave).
 *
 * Reads the local database, so a table the user does not sync is not seen. Events, venues and
 * work trackers, the ones a tracker's address is really shared with, sync to everyone who can edit
 * a work tracker.
 */
export async function fetchSharedAddressUuids(
  addressUuids: (string | null | undefined)[],
  workTrackerUuid: string,
): Promise<Set<string>> {
  const ids = [...new Set(addressUuids.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Set();
  const rows = await typedGetAll(
    sharedAddressesQuery(ids, workTrackerUuid),
    expect<{ id: string | null }>(),
  );
  return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
}
