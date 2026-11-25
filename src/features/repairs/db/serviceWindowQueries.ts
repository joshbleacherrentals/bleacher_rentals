import { db } from "@/components/providers/SystemProvider";

/**
 * The local queries behind the service window and the damage report window: the card of one
 * bleacher, the details of some damage reports and their photos. Each returns a compiled Kysely
 * query with its own row type; `useRepairDetails` ties every one to its type with `expect<T>()`,
 * so a change to the local schema breaks the build here. What the rows turn into is decided in
 * `../utils/repairDetails.ts`. docs/specs/repairs-06-expanded-row.md §3.
 *
 * No query uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods. The
 * bleacher query lists its columns and never selects `asset_value_cents` (maintenance-01: it is
 * not shown anywhere).
 */

/** What `in (...)` gets for an empty list: an id nothing has, so the query matches nothing. */
const NO_ID = "__none__";
const idsOrNone = (ids: readonly string[]) => (ids.length > 0 ? [...ids] : [NO_ID]);

export type RawServiceBleacherRow = {
  id: string;
  bleacherNumber: number | null;
  modelNumber: string | null;
  typeName: string | null;
  zoneName: string | null;
};

/** One bleacher with its model number, the name of its type and the name of its current zone. */
export function buildServiceBleacherQuery(bleacherUuid: string) {
  return db
    .selectFrom("Bleachers as b")
    .leftJoin("BleacherTypes as t", "t.id", "b.bleacher_type_uuid")
    .leftJoin("Zones as z", "z.id", "b.zone_uuid")
    .select([
      "b.id as id",
      "b.bleacher_number as bleacherNumber",
      "b.model_number as modelNumber",
      "t.name as typeName",
      "z.display_name as zoneName",
    ])
    .where("b.id", "=", bleacherUuid)
    .compile();
}

export type RawReportDetailRow = {
  id: string;
  bleacherNumber: number | null;
  createdAt: string | null;
  resolvedAt: string | null;
  seatDamage: string | null;
  haulDamage: string | null;
  isSafeToSit: number | null;
  isSafeToHaul: number | null;
  note: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  fixedByDriver: number | null;
  fixedAt: string | null;
  fixerFirstName: string | null;
  fixerLastName: string | null;
};

/**
 * The damage reports with these ids that are not deleted, with the bleacher's number and the names
 * of whoever created the report and whoever marked it fixed (a second join: they are rarely the
 * same person).
 */
export function buildReportDetailsQuery(reportIds: readonly string[]) {
  return db
    .selectFrom("DamageReports as dr")
    .leftJoin("Bleachers as b", "b.id", "dr.bleacher_uuid")
    .leftJoin("Users as u", "u.id", "dr.created_by_user_uuid")
    .leftJoin("Users as fu", "fu.id", "dr.fixed_by_user_uuid")
    .select([
      "dr.id as id",
      "b.bleacher_number as bleacherNumber",
      "dr.created_at as createdAt",
      "dr.resolved_at as resolvedAt",
      "dr.seat_damage as seatDamage",
      "dr.haul_damage as haulDamage",
      "dr.is_safe_to_sit as isSafeToSit",
      "dr.is_safe_to_haul as isSafeToHaul",
      "dr.note as note",
      "u.first_name as creatorFirstName",
      "u.last_name as creatorLastName",
      "dr.fixed_by_driver as fixedByDriver",
      "dr.fixed_at as fixedAt",
      "fu.first_name as fixerFirstName",
      "fu.last_name as fixerLastName",
    ])
    .where("dr.id", "in", idsOrNone(reportIds))
    .where("dr.deleted", "=", 0)
    .compile();
}

export type RawReportPhotoRow = { id: string; reportId: string | null; path: string | null };

/** The photos of these damage reports, the earliest first. */
export function buildReportPhotosQuery(reportIds: readonly string[]) {
  return db
    .selectFrom("DamageReportPhotos as p")
    .select(["p.id as id", "p.damage_report_uuid as reportId", "p.photo_path as path"])
    .where("p.damage_report_uuid", "in", idsOrNone(reportIds))
    .orderBy("p.created_at", "asc")
    .compile();
}
