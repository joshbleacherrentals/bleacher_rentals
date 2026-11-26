import { db } from "@/components/providers/SystemProvider";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";

/** One completed work tracker of the zone and week, with its GPS proof (null before the first check). */
export type WeekProofRow = {
  id: string;
  date: string | null;
  completed_at: string | null;
  bleacher_uuid: string | null;
  bleacher_number: number | null;
  driver_first: string | null;
  driver_last: string | null;
  dropoff_street: string | null;
  dropoff_city: string | null;
  status: string | null;
  final: number | null;
  checked_at: string | null;
  evidence_at: string | null;
  distance_meters: number | null;
  evidence_place: string | null;
  gps_last_report_at: string | null;
};

/**
 * The Delivery Proof page: the completed work trackers dated in the week on the zone's bleachers
 * (the same zone rule as the panel's tracker counts), each with its proof if it has one.
 */
export function weekProofsQuery(zoneId: string, weekStart: string) {
  return db
    .selectFrom("WorkTrackers as w")
    .innerJoin("Bleachers as b", "b.id", "w.bleacher_uuid")
    .leftJoin("Drivers as d", "d.id", "w.driver_uuid")
    .leftJoin("Users as u", "u.id", "d.user_uuid")
    .leftJoin("Addresses as a", "a.id", "w.dropoff_address_uuid")
    .leftJoin("DeliveryProofs as p", "p.work_tracker_uuid", "w.id")
    .select([
      "w.id as id",
      "w.date as date",
      "w.completed_at as completed_at",
      "w.bleacher_uuid as bleacher_uuid",
      "b.bleacher_number as bleacher_number",
      "u.first_name as driver_first",
      "u.last_name as driver_last",
      "a.street as dropoff_street",
      "a.city as dropoff_city",
      "p.status as status",
      "p.final as final",
      "p.checked_at as checked_at",
      "p.evidence_at as evidence_at",
      "p.distance_meters as distance_meters",
      "p.evidence_place as evidence_place",
      "p.gps_last_report_at as gps_last_report_at",
    ])
    .where("b.zone_uuid", "=", zoneId)
    .where("w.date", ">=", weekStart)
    .where("w.date", "<=", weekEndOf(weekStart))
    .where("w.status", "=", "completed")
    .compile();
}

/** The proof of each listed work tracker, for the Proof of Delivery column of a driver's week. */
export function proofStatusesQuery(ids: string[]) {
  return db
    .selectFrom("DeliveryProofs")
    .select([
      "work_tracker_uuid",
      "status",
      "final",
      "evidence_at",
      "distance_meters",
      "evidence_place",
      "gps_last_report_at",
    ])
    .where("work_tracker_uuid", "in", ids.length ? ids : ["__none__"])
    .compile();
}

/** When the check last ran, by any route (the newest checked_at). */
export function lastCheckQuery() {
  return db
    .selectFrom("DeliveryProofs")
    .select((eb) => eb.fn.max("checked_at").as("last"))
    .compile();
}
