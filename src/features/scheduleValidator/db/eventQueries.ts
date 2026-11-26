import { db } from "@/components/providers/SystemProvider";

/** Never matches an event id: keeps `in (...)` valid when there are no events to look up. */
export const NO_EVENT = "__no_event__";

/** Event Data: the listed events with their own address, for the data checks. */
export function eventDataQuery(eventIds: string[]) {
  return db
    .selectFrom("Events as e")
    .leftJoin("Addresses as a", "a.id", "e.address_uuid")
    .select([
      "e.id as event_uuid",
      "e.event_name as event_name",
      "e.setup_start as setup_start",
      "e.event_start as event_start",
      "e.address_uuid as address_uuid",
      "a.street as street",
      "a.city as city",
      "a.state_province as state_province",
      "a.zip_postal as zip_postal",
      "a.country as country",
      "a.latitude as latitude",
      "a.longitude as longitude",
      "a.place_id as place_id",
    ])
    .where("e.id", "in", eventIds.length > 0 ? eventIds : [NO_EVENT])
    .compile();
}
