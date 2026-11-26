import { db } from "@/components/providers/SystemProvider";

/**
 * The eight local queries behind Dashboard & Analytics. Each returns a compiled Kysely query with
 * its own row type; `useAnalyticsData` ties every one to its type with `expect<T>()`, so a change
 * to the local schema breaks the build here. The rules that turn the rows into figures are in
 * `../utils/buildAnalytics.ts`. docs/specs/dashboard-analytics-04-data-numbers.md §2.1.
 *
 * No query uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods.
 */

export type RawAnalyticsRepair = {
  id: string;
  eventStart: string | null;
  status: string | null;
  currency: string | null;
  zoneUuid: string | null;
  vendorUuid: string | null;
  costCents: number | null;
};

/** The live repairs. */
export function buildAnalyticsRepairsQuery() {
  return db
    .selectFrom("MaintenanceEvents as me")
    .select([
      "me.id as id",
      "me.event_start as eventStart",
      "me.status as status",
      "me.currency as currency",
      "me.zone_uuid as zoneUuid",
      "me.vendor_uuid as vendorUuid",
      "me.cost_cents as costCents",
    ])
    .where("me.deleted", "=", 0)
    .compile();
}

export type RawAnalyticsService = {
  id: string;
  repairId: string | null;
  bleacherUuid: string | null;
  categoryUuid: string | null;
  laborCents: number | null;
  partsCents: number | null;
  taxCents: number | null;
  freightCents: number | null;
};

/** The live services of the live repairs. */
export function buildAnalyticsServicesQuery() {
  return db
    .selectFrom("MaintenanceLineItems as li")
    .innerJoin("MaintenanceEvents as me", "me.id", "li.maintenance_event_uuid")
    .select([
      "li.id as id",
      "li.maintenance_event_uuid as repairId",
      "li.bleacher_uuid as bleacherUuid",
      "li.damage_category_uuid as categoryUuid",
      "li.labor_cents as laborCents",
      "li.parts_cents as partsCents",
      "li.tax_cents as taxCents",
      "li.freight_cents as freightCents",
    ])
    .where("li.deleted", "=", 0)
    .where("me.deleted", "=", 0)
    .compile();
}

export type RawAnalyticsRepairBleacher = {
  bleacherUuid: string | null;
  repairId: string | null;
};

/** The bleachers of the live repairs, from the junction (D36). */
export function buildAnalyticsRepairBleachersQuery() {
  return db
    .selectFrom("BleacherMaintEvents as bme")
    .innerJoin("MaintenanceEvents as me", "me.id", "bme.maintenance_event_uuid")
    .select(["bme.bleacher_uuid as bleacherUuid", "bme.maintenance_event_uuid as repairId"])
    .where("me.deleted", "=", 0)
    .compile();
}

export type RawAnalyticsBleacher = {
  id: string;
  zoneUuid: string | null;
  modelNumber: string | null;
};

/** The live bleachers (D13). */
export function buildAnalyticsBleachersQuery() {
  return db
    .selectFrom("Bleachers as b")
    .select(["b.id as id", "b.zone_uuid as zoneUuid", "b.model_number as modelNumber"])
    .where("b.deleted", "=", 0)
    .compile();
}

export type RawAnalyticsZone = { id: string; name: string | null };

/** Every zone (D19). */
export function buildAnalyticsZonesQuery() {
  return db.selectFrom("Zones as z").select(["z.id as id", "z.display_name as name"]).compile();
}

export type RawAnalyticsVendor = { id: string; name: string | null };

/** Every vendor, active or not (D23). */
export function buildAnalyticsVendorsQuery() {
  return db.selectFrom("Vendors as v").select(["v.id as id", "v.display_name as name"]).compile();
}

export type RawAnalyticsCategory = { id: string; name: string | null; isActive: number | null };

/** Every damage category, with its flag (D21). */
export function buildAnalyticsCategoriesQuery() {
  return db
    .selectFrom("DamageCategories as c")
    .select(["c.id as id", "c.name as name", "c.is_active as isActive"])
    .compile();
}

export type RawAnalyticsBudget = {
  year: number | null;
  currency: string | null;
  amountCents: number | null;
};

/** Every yearly budget (D18). */
export function buildAnalyticsBudgetsQuery() {
  return db
    .selectFrom("MaintenanceBudgets as mb")
    .select(["mb.year as year", "mb.currency as currency", "mb.amount_cents as amountCents"])
    .compile();
}
