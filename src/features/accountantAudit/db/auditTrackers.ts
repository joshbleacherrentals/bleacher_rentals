import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { AuditRange } from "../utils/auditRange";

/**
 * The local queries behind the Audit tab: one driver's work trackers, a page at a time, with
 * Paid / Not paid read through the tracker's own group link.
 * docs/specs/accountant-audit-03-tracker-data.md §3, widened by the date range and the rule that
 * a tracker with no date is never listed in accountant-audit-05-drivers-table.md §2.1 (D8, D15).
 */

/** Sentinel that matches no driver (inert query for "no driver"). */
const NO_DRIVER = "__none__";

/**
 * A driver's trackers, newest date first (D5), every status (D1), before any paging. The group is
 * joined on `wt.worktracker_group_uuid` (A1, R1): no date comparison, no week arithmetic, at most
 * one group per tracker. Left joins throughout, so a missing type, bleacher or address row leaves
 * the tracker listed with nulls (R6). The last tie-break on `wt.id` keeps a row from moving between
 * pages (R3). One query behind both the pages and the Export to CSV button, so the file lists what
 * the pages list, in the same order.
 */
function auditTrackersQuery(driverUuid: string | null, range: AuditRange) {
  return (
    db
      .selectFrom("WorkTrackers as wt")
      .leftJoin("Bleachers as b", "b.id", "wt.bleacher_uuid")
      .leftJoin("WorkTrackerTypes as t", "t.id", "wt.work_tracker_type_uuid")
      .leftJoin("Addresses as pu", "pu.id", "wt.pickup_address_uuid")
      .leftJoin("Addresses as dof", "dof.id", "wt.dropoff_address_uuid")
      .leftJoin("WorkTrackerGroups as g", "g.id", "wt.worktracker_group_uuid")
      .select([
        "wt.id as id",
        "wt.status as status",
        "wt.date as date",
        "b.bleacher_number as bleacher_number",
        "t.code as type_code",
        "t.display_name as type_name",
        "pu.id as pickup_id",
        "pu.street as pickup_street",
        "pu.city as pickup_city",
        "pu.state_province as pickup_state_province",
        "pu.zip_postal as pickup_zip_postal",
        "dof.id as dropoff_id",
        "dof.street as dropoff_street",
        "dof.city as dropoff_city",
        "dof.state_province as dropoff_state_province",
        "dof.zip_postal as dropoff_zip_postal",
        "wt.drive_minutes as drive_minutes",
        "wt.distance_meters as distance_meters",
        "g.id as group_id",
        "g.is_paid as group_is_paid",
      ])
      .where("wt.driver_uuid", "=", driverUuid ?? NO_DRIVER)
      // D15: undated trackers are never listed; D8: the range bounds both ends, ends included.
      .where("wt.date", "is not", null)
      .$if(range.from !== null, (qb) => qb.where("wt.date", ">=", range.from!))
      .$if(range.to !== null, (qb) => qb.where("wt.date", "<=", range.to!))
      .orderBy("wt.date", "desc")
      // Same-day trackers go by pickup time ("HH:MM:SS" text); Any Time (null) last in the day.
      .orderBy(sql<string>`wt.pickup_time_start is null`, "asc")
      .orderBy("wt.pickup_time_start", "asc")
      .orderBy("wt.id", "asc")
  );
}

/** One page of a driver's trackers (see `auditTrackersQuery`). */
export function buildAuditTrackersQuery(
  driverUuid: string | null,
  range: AuditRange,
  page: number,
  pageSize: number,
) {
  return auditTrackersQuery(driverUuid, range)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .compile();
}

/** Every one of a driver's trackers in the range, for the Export to CSV button: no paging. */
export function buildAuditTrackersExportQuery(driverUuid: string | null, range: AuditRange) {
  return auditTrackersQuery(driverUuid, range).compile();
}

/** How many trackers the driver has in the range: the total behind the pager. */
export function buildAuditTrackerCountQuery(driverUuid: string | null, range: AuditRange) {
  return (
    db
      .selectFrom("WorkTrackers")
      // The callback form: `db` is the app's bound lazy proxy, which strips the methods off `db.fn`.
      .select(({ fn }) => fn.countAll<number>().as("total"))
      .where("driver_uuid", "=", driverUuid ?? NO_DRIVER)
      .where("date", "is not", null)
      .$if(range.from !== null, (qb) => qb.where("date", ">=", range.from!))
      .$if(range.to !== null, (qb) => qb.where("date", "<=", range.to!))
      .compile()
  );
}
