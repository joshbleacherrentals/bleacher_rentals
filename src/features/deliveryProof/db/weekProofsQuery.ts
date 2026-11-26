import { db } from "@/components/providers/SystemProvider";
import { driverUuidsInZone } from "@/features/scheduleValidator/db/driverQueries";

/** One work tracker of a zone driver's week, with its proof's status (null before any check). */
export type DriverProofRow = {
  driver_uuid: string | null;
  date: string | null;
  tracker_status: string | null;
  proof_status: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * The Proof of Delivery page: every work tracker dated in the week for the zone's drivers (the same
 * drivers as Driver Workload), whatever its status, each with its GPS proof's status.
 */
export function driverProofsQuery(zoneId: string, weekStart: string, weekEnd: string) {
  return db
    .selectFrom("WorkTrackers as w")
    .innerJoin("Drivers as d", "d.id", "w.driver_uuid")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .leftJoin("DeliveryProofs as p", "p.work_tracker_uuid", "w.id")
    .select([
      "w.driver_uuid as driver_uuid",
      "w.date as date",
      "w.status as tracker_status",
      "p.status as proof_status",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .where("w.date", ">=", weekStart)
    .where("w.date", "<=", weekEnd)
    .where("w.driver_uuid", "in", driverUuidsInZone(zoneId))
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
