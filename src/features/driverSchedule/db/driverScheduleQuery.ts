import { db } from "@/components/providers/SystemProvider";
import { OFF_STATUSES } from "@/features/scheduleValidator/db/driverQueries";

/**
 * A driver's work trackers dated in the week, unless off, with what the schedule paints: planned
 * times, the drive minutes of each leg and the trip it follows. The driver is found by their user
 * (the Users row the driver's pages are keyed by). Every zone: it is the driver's whole week.
 */
export function driverScheduleQuery(userUuid: string, weekStart: string, weekEnd: string) {
  return db
    .selectFrom("WorkTrackers as w")
    .innerJoin("Drivers as d", "d.id", "w.driver_uuid")
    .leftJoin("Bleachers as b", "b.id", "w.bleacher_uuid")
    .leftJoin("Addresses as pa", "pa.id", "w.pickup_address_uuid")
    .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
    .select([
      "w.id as id",
      "w.date as date",
      "w.previous_work_tracker_uuid as previous_work_tracker_uuid",
      "w.planned_pickup_at as planned_pickup_at",
      "w.planned_dropoff_at as planned_dropoff_at",
      "w.drive_minutes as drive_minutes",
      "w.deadhead_in_drive_minutes as deadhead_in_drive_minutes",
      "w.return_home_drive_minutes as return_home_drive_minutes",
      "b.bleacher_number as bleacher_number",
      "pa.street as pickup_street",
      "da.street as dropoff_street",
    ])
    .where("d.user_uuid", "=", userUuid)
    .where("w.date", ">=", weekStart)
    .where("w.date", "<=", weekEnd)
    .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
    .compile();
}

/** The driver's name, from their user. */
export function driverNameQuery(userUuid: string) {
  return db
    .selectFrom("Users as u")
    .select(["u.first_name as first_name", "u.last_name as last_name"])
    .where("u.id", "=", userUuid)
    .compile();
}
