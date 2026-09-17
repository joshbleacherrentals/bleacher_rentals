"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type PsBleacherRow = {
  id: string;
  bleacher_number: number | null;
  bleacher_rows: number | null;
  bleacher_seats: number | null;
  bleacher_type_uuid: string | null;
  linxup_device_id: string | null;
  summer_account_manager_uuid: string | null;
  winter_account_manager_uuid: string | null;
  summer_home_base_uuid: string | null;
  winter_home_base_uuid: string | null;
  zone_uuid: string | null;
  storage_location_uuid: string | null;
};

const compiled = db
  .selectFrom("Bleachers as b")
  .select([
    "b.id",
    "b.bleacher_number",
    "b.bleacher_rows",
    "b.bleacher_seats",
    "b.bleacher_type_uuid",
    "b.linxup_device_id",
    "b.summer_account_manager_uuid",
    "b.winter_account_manager_uuid",
    "b.summer_home_base_uuid",
    "b.winter_home_base_uuid",
    "b.zone_uuid",
    "b.storage_location_uuid",
  ])
  .where("b.deleted", "=", 0)
  .orderBy("b.bleacher_number", "asc")
  .compile();

/**
 * The full query result, including `isLoading`.
 *
 * `usePsBleachers` collapses that to an array, which cannot tell "no rows yet"
 * from "no rows at all". Anything that draws a conclusion from emptiness — an
 * alert calculation, most of all, where an empty list reads as "no problems" —
 * must use this and wait.
 */
export function usePsBleachersQuery() {
  return useTypedQuery(compiled, expect<PsBleacherRow>());
}

export function usePsBleachers() {
  return usePsBleachersQuery().data ?? [];
}
