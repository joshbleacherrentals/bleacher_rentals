import { db } from "@/components/providers/SystemProvider";

/** The zone and week's model runs, newest first, with who ran and who discarded them. */
export function runsForWeekQuery(autoKey: string) {
  return db
    .selectFrom("AutoWorkTrackerRuns as r")
    .leftJoin("Users as cu", "cu.id", "r.created_by_user_uuid")
    .leftJoin("Users as du", "du.id", "r.discarded_by_user_uuid")
    .select([
      "r.id as id",
      "r.created_at as created_at",
      "r.app_version as app_version",
      "r.commit_sha as commit_sha",
      "r.settings as settings",
      "r.result as result",
      "r.trips_created as trips_created",
      "r.discarded_at as discarded_at",
      "cu.first_name as created_by_first",
      "cu.last_name as created_by_last",
      "du.first_name as discarded_by_first",
      "du.last_name as discarded_by_last",
    ])
    .where("r.auto_work_tracker_id", "=", autoKey)
    .orderBy("r.created_at", "desc")
    .compile();
}

/** The trips a run created, with their snapshots. */
export function runTripsQuery(runUuid: string) {
  return db
    .selectFrom("AutoWorkTrackerRunTrips")
    .select(["id", "work_tracker_uuid", "snapshot"])
    .where("run_uuid", "=", runUuid)
    .compile();
}

/** Those trips' work trackers as they are now (a deleted one is simply missing). */
export function currentTrackersQuery(ids: string[]) {
  return db
    .selectFrom("WorkTrackers")
    .selectAll()
    .where("id", "in", ids.length ? ids : ["__none__"])
    .compile();
}

/** Their line items as they are now. */
export function currentLineItemsQuery(ids: string[]) {
  return db
    .selectFrom("WorkTrackerLineItems")
    .select(["work_tracker_uuid", "type", "qty_decimal", "unit_amt_cents"])
    .where("work_tracker_uuid", "in", ids.length ? ids : ["__none__"])
    .compile();
}

/** Why people changed the run's trips or discarded it. */
export function runFeedbackQuery(runUuid: string) {
  return db
    .selectFrom("AutoWorkTrackerFeedback as f")
    .leftJoin("Users as u", "u.id", "f.created_by_user_uuid")
    .select([
      "f.id as id",
      "f.created_at as created_at",
      "f.kind as kind",
      "f.reason as reason",
      "f.work_tracker_uuid as work_tracker_uuid",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .where("f.run_uuid", "=", runUuid)
    .orderBy("f.created_at", "asc")
    .compile();
}

/** Driver names, for the planned and current drivers. */
export function driverNamesQuery(ids: string[]) {
  return db
    .selectFrom("Drivers as d")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .select(["d.id as id", "u.first_name as first_name", "u.last_name as last_name"])
    .where("d.id", "in", ids.length ? ids : ["__none__"])
    .compile();
}

/** Bleacher numbers. */
export function bleacherNumbersQuery(ids: string[]) {
  return db
    .selectFrom("Bleachers")
    .select(["id", "bleacher_number"])
    .where("id", "in", ids.length ? ids : ["__none__"])
    .compile();
}
