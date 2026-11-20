import { db } from "@/components/providers/SystemProvider";
import { OFF_STATUSES } from "./driverQueries";

/** Never matches an id: keeps `in (...)` valid when there is nothing to look up. */
const NO_MATCH = "__no_match__";

/** Bleacher Data: the work trackers dated in the week for the zone's bleachers, unless off. */
export function weekWorkTrackersQuery(zoneId: string, weekStart: string, weekEnd: string) {
  return db
    .selectFrom("WorkTrackers as w")
    .innerJoin("Bleachers as b", "b.id", "w.bleacher_uuid")
    .leftJoin("Addresses as pa", "pa.id", "w.pickup_address_uuid")
    .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
    .select([
      "w.id as id",
      "w.bleacher_uuid as bleacher_uuid",
      "b.bleacher_number as bleacher_number",
      "w.date as date",
      "w.status as status",
      "w.pickup_address_uuid as pickup_address_uuid",
      "w.dropoff_address_uuid as dropoff_address_uuid",
      "w.pickup_event_uuid as pickup_event_uuid",
      "w.dropoff_event_uuid as dropoff_event_uuid",
      "pa.street as pickup_street",
      "da.street as dropoff_street",
    ])
    .where("b.zone_uuid", "=", zoneId)
    .where("b.deleted", "=", 0)
    .where("w.date", ">=", weekStart)
    .where("w.date", "<=", weekEnd)
    .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
    .compile();
}

/** The address rows with the given ids, every column the address check reads. */
export function addressesQuery(ids: string[]) {
  return db
    .selectFrom("Addresses as a")
    .select([
      "a.id as id",
      "a.street as street",
      "a.city as city",
      "a.state_province as state_province",
      "a.zip_postal as zip_postal",
      "a.country as country",
      "a.latitude as latitude",
      "a.longitude as longitude",
      "a.place_id as place_id",
    ])
    .where("a.id", "in", ids.length > 0 ? ids : [NO_MATCH])
    .compile();
}

/** The names of the given events. */
export function eventNamesQuery(ids: string[]) {
  return db
    .selectFrom("Events as e")
    .select(["e.id as id", "e.event_name as event_name"])
    .where("e.id", "in", ids.length > 0 ? ids : [NO_MATCH])
    .compile();
}
