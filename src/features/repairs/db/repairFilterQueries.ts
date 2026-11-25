import { db } from "@/components/providers/SystemProvider";

/**
 * The four local queries behind the lists of the Repairs filters (Bleacher, Zone, Vendor,
 * Category). Each returns a compiled Kysely query with its own row type; `useRepairFilterOptions`
 * ties every one to its type with `expect<T>()`. What is listed, and in what order, is decided by
 * `buildRepairFilterOptions` in `../utils/repairFilters.ts`.
 * docs/specs/repairs-05-toolbar.md §3.
 *
 * No query uses `db.fn`: the app's `db` is a bound proxy that strips its helper methods.
 */

export type RawBleacherOption = {
  id: string;
  bleacherNumber: number | null;
  deleted: number | null;
};

/** Every bleacher, with its deleted flag (the list leaves deleted ones out, D61). */
export function buildBleacherOptionsQuery() {
  return db
    .selectFrom("Bleachers")
    .select(["id as id", "bleacher_number as bleacherNumber", "deleted as deleted"])
    .compile();
}

export type RawZoneOption = { id: string; name: string | null };

export function buildZoneOptionsQuery() {
  return db.selectFrom("Zones").select(["id as id", "display_name as name"]).compile();
}

export type RawVendorOption = { id: string; name: string | null; isActive: number | null };

/** Every vendor, switched-off ones too (they are marked inactive, D61). */
export function buildVendorOptionsQuery() {
  return db
    .selectFrom("Vendors")
    .select(["id as id", "display_name as name", "is_active as isActive"])
    .compile();
}

export type RawCategoryOption = { id: string; name: string | null; isActive: number | null };

/** Every damage category, switched-off ones too. */
export function buildCategoryOptionsQuery() {
  return db
    .selectFrom("DamageCategories")
    .select(["id as id", "name as name", "is_active as isActive"])
    .compile();
}
