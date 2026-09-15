"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";

export type SimpleOption = { uuid: string; label: string };

type BleacherOptionRow = {
  id: string;
  bleacher_number: number | null;
  summer_account_manager_uuid: string | null;
  winter_account_manager_uuid: string | null;
};

/**
 * Local-first replacement for `fetchBleachersForOptions`, which pulled the whole
 * `Bleachers` table over the network every time the work tracker modal opened on
 * a cold cache. PowerSync already syncs the table.
 */
export async function readBleacherOptions(
  accountManagerId?: string | null,
): Promise<SimpleOption[]> {
  const rows = await typedGetAll(
    db
      .selectFrom("Bleachers")
      .select([
        "id",
        "bleacher_number",
        "summer_account_manager_uuid",
        "winter_account_manager_uuid",
      ])
      // 0, not `false`: PowerSync stores booleans as integers.
      .where("deleted", "=", 0)
      .orderBy("bleacher_number", "asc")
      .compile(),
    expect<BleacherOptionRow>(),
  );

  const owned = accountManagerId
    ? rows.filter(
        (b) =>
          b.summer_account_manager_uuid === accountManagerId ||
          b.winter_account_manager_uuid === accountManagerId,
      )
    : rows;

  return owned.map((b) => ({ uuid: b.id, label: String(b.bleacher_number) }));
}
