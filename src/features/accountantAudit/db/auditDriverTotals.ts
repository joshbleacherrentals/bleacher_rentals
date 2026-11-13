import { db } from "@/components/providers/SystemProvider";
import type { AuditRange } from "../utils/auditRange";

export type { AuditDriverTotalsResultRow } from "../utils/auditDriverRows";

/**
 * The local query behind the drivers table of the Audit tab: one row per driver with at least one
 * tracker in the range. docs/specs/accountant-audit-05-drivers-table.md §2.2 (D1, D2, D15, R16).
 *
 * It follows the rule of the trigger behind /driver-scorecard
 * (supabase/migrations/20260421231714_driver-scorecard.sql): a tracker counts when it has a
 * driver and a date, whatever its status, one trip per tracker, a null metric as 0 (the caller
 * turns the null sums of the SQL into 0). The inner joins to `Drivers` and `Users` are the
 * scorecard's too. The dates are `YYYY-MM-DD` text, so `>=` and `<=` compare them as dates, both
 * ends included. The rows come back unordered: sorting is the caller's (R23).
 *
 * The aggregates use the callback form: the app's `db` proxy strips the methods off `db.fn`.
 */
export function buildAuditDriverTotalsQuery(range: AuditRange) {
  return db
    .selectFrom("WorkTrackers as wt")
    .innerJoin("Drivers as d", "d.id", "wt.driver_uuid")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .select(({ fn }) => [
      "wt.driver_uuid as driver_uuid",
      "u.first_name as first_name",
      "u.last_name as last_name",
      "d.pay_currency as pay_currency",
      fn.sum<number | null>("wt.distance_meters").as("distance_meters"),
      fn.sum<number | null>("wt.drive_minutes").as("drive_minutes"),
      fn.sum<number | null>("wt.pay_cents").as("pay_cents"),
      fn.countAll<number>().as("trip_count"),
    ])
    .where("wt.driver_uuid", "is not", null)
    .where("wt.date", "is not", null)
    .$if(range.from !== null, (qb) => qb.where("wt.date", ">=", range.from!))
    .$if(range.to !== null, (qb) => qb.where("wt.date", "<=", range.to!))
    .groupBy(["wt.driver_uuid", "u.first_name", "u.last_name", "d.pay_currency"]);
}
