import { db } from "@/components/providers/SystemProvider";

/**
 * The five local queries behind the Repairs list. Each returns a compiled Kysely query with its own
 * row type; `useRepairList` ties every one to its type with `expect<T>()`, so a change to the local
 * schema breaks the build here. The rules that turn the rows into list rows are in
 * `../utils/repairRows.ts`. docs/specs/repairs-03-list-query.md §3.
 *
 * No query uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods.
 */

type ViewParams = {
  /** Show Deleted: the deleted repairs (with all their services) instead of the live ones (D34). */
  showDeleted: boolean;
};

export type RawRepairRow = {
  id: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  notes: string | null;
  createdAt: string | null;
  deleted: number | null;
  status: string | null;
  currency: string | null;
  invoiceNumber: string | null;
  completedAt: string | null;
  costCents: number | null;
  vendorUuid: string | null;
  vendorName: string | null;
  zoneUuid: string | null;
  zoneName: string | null;
};

/** The repairs of the view, with the vendor's name and the name of the stored zone. */
export function buildRepairsQuery({ showDeleted }: ViewParams) {
  return db
    .selectFrom("MaintenanceEvents as me")
    .leftJoin("Vendors as v", "v.id", "me.vendor_uuid")
    .leftJoin("Zones as z", "z.id", "me.zone_uuid")
    .select([
      "me.id as id",
      "me.event_name as eventName",
      "me.event_start as eventStart",
      "me.event_end as eventEnd",
      "me.notes as notes",
      "me.created_at as createdAt",
      "me.deleted as deleted",
      "me.status as status",
      "me.currency as currency",
      "me.invoice_number as invoiceNumber",
      "me.completed_at as completedAt",
      "me.cost_cents as costCents",
      "me.vendor_uuid as vendorUuid",
      "v.display_name as vendorName",
      "me.zone_uuid as zoneUuid",
      "z.display_name as zoneName",
    ])
    .where("me.deleted", "=", showDeleted ? 1 : 0)
    .compile();
}

export type RawServiceRow = {
  id: string;
  repairId: string | null;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  categoryUuid: string | null;
  categoryName: string | null;
  severity: string | null;
  description: string | null;
  laborCents: number | null;
  partsCents: number | null;
  taxCents: number | null;
  freightCents: number | null;
  deleted: number | null;
  createdAt: string | null;
};

/**
 * The services of the repairs of the view. The repair's `deleted` flag comes from the join. In the
 * normal view a service deleted by itself is left out; in Show Deleted every service of a deleted
 * repair is returned, whatever its own flag (D34).
 */
export function buildServicesQuery({ showDeleted }: ViewParams) {
  return db
    .selectFrom("MaintenanceLineItems as li")
    .innerJoin("MaintenanceEvents as me", "me.id", "li.maintenance_event_uuid")
    .leftJoin("Bleachers as b", "b.id", "li.bleacher_uuid")
    .leftJoin("DamageCategories as c", "c.id", "li.damage_category_uuid")
    .select([
      "li.id as id",
      "li.maintenance_event_uuid as repairId",
      "li.bleacher_uuid as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "li.damage_category_uuid as categoryUuid",
      "c.name as categoryName",
      "li.severity as severity",
      "li.description as description",
      "li.labor_cents as laborCents",
      "li.parts_cents as partsCents",
      "li.tax_cents as taxCents",
      "li.freight_cents as freightCents",
      "li.deleted as deleted",
      "li.created_at as createdAt",
    ])
    .where("me.deleted", "=", showDeleted ? 1 : 0)
    .$if(!showDeleted, (qb) => qb.where("li.deleted", "=", 0))
    .compile();
}

export type RawRepairBleacherRow = {
  repairId: string | null;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  zoneUuid: string | null;
  zoneName: string | null;
};

/** The bleachers of the repairs of the view, from the junction, with each bleacher's zone (D29). */
export function buildRepairBleachersQuery({ showDeleted }: ViewParams) {
  return db
    .selectFrom("BleacherMaintEvents as bme")
    .innerJoin("MaintenanceEvents as me", "me.id", "bme.maintenance_event_uuid")
    .leftJoin("Bleachers as b", "b.id", "bme.bleacher_uuid")
    .leftJoin("Zones as z", "z.id", "b.zone_uuid")
    .select([
      "bme.maintenance_event_uuid as repairId",
      "bme.bleacher_uuid as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "b.zone_uuid as zoneUuid",
      "z.display_name as zoneName",
    ])
    .where("me.deleted", "=", showDeleted ? 1 : 0)
    .compile();
}

export type RawReportRow = {
  id: string;
  bleacherUuid: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  repairId: string | null;
};

/**
 * Every damage report that is not deleted. The photo-upload flag is not looked at (§2.6): a report
 * counts as soon as it exists on the device.
 */
export function buildReportsQuery() {
  return db
    .selectFrom("DamageReports as dr")
    .select([
      "dr.id as id",
      "dr.bleacher_uuid as bleacherUuid",
      "dr.created_at as createdAt",
      "dr.resolved_at as resolvedAt",
      "dr.maintenance_event_uuid as repairId",
    ])
    .where("dr.deleted", "=", 0)
    .compile();
}

export type RawReportCategoryRow = {
  reportId: string | null;
  categoryUuid: string | null;
};

/** The categories of the damage reports. */
export function buildReportCategoriesQuery() {
  return db
    .selectFrom("DamageReportCategories as drc")
    .select(["drc.damage_report_uuid as reportId", "drc.damage_category_uuid as categoryUuid"])
    .compile();
}
