"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { isBleacherAccessible } from "../utils/bleacherLabelStyle";

type BleacherRow = {
  id: string;
  bleacher_number: number | null;
  bleacher_rows: number | null;
  bleacher_seats: number | null;
  linxup_device_id: string | null;
  zone_uuid: string | null;
  zone_name: string | null;
  storage_location_name: string | null;
};

/** What a bleacher's label cell shows, the same facts as the dashboard's left column. */
export type GridBleacher = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  bleacherRows: number | null;
  bleacherSeats: number | null;
  /** A Linxup tracking device is assigned (the dashboard then shows a map pin). */
  hasDevice: boolean;
  zoneName: string | null;
  storageLocationName: string | null;
  /** False shows the bleacher greyed out, as the dashboard does for ones the viewer does not own. */
  isAccessible: boolean;
};

/** The bleachers of one zone, by number, read from the local database. Empty until a zone is chosen. */
export function useZoneBleachers(zoneId: string): {
  bleachers: GridBleacher[];
  isLoading: boolean;
} {
  const isAdmin = usePermissionsStore((s) => s.isAdmin);
  const isAccountManager = usePermissionsStore((s) => s.isAccountManager);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("Bleachers as b")
        .leftJoin("Zones as z", "z.id", "b.zone_uuid")
        .leftJoin("StorageLocations as s", "s.id", "b.storage_location_uuid")
        .select([
          "b.id as id",
          "b.bleacher_number as bleacher_number",
          "b.bleacher_rows as bleacher_rows",
          "b.bleacher_seats as bleacher_seats",
          "b.linxup_device_id as linxup_device_id",
          "b.zone_uuid as zone_uuid",
          "z.display_name as zone_name",
          "s.name as storage_location_name",
        ])
        .where("b.zone_uuid", "=", zoneId)
        .where("b.deleted", "=", 0)
        .orderBy("b.bleacher_number", "asc")
        .compile(),
    [zoneId],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<BleacherRow>());

  const bleachers = useMemo<GridBleacher[]>(
    () =>
      zoneId
        ? (data ?? []).map((b) => ({
            bleacherUuid: b.id,
            bleacherNumber: b.bleacher_number,
            bleacherRows: b.bleacher_rows,
            bleacherSeats: b.bleacher_seats,
            hasDevice: !!b.linxup_device_id,
            zoneName: b.zone_name,
            storageLocationName: b.storage_location_name,
            isAccessible: isBleacherAccessible({
              isAdmin,
              isAccountManager,
              accountManagerZoneIds,
              bleacherZoneUuid: b.zone_uuid,
            }),
          }))
        : [],
    [zoneId, data, isAdmin, isAccountManager, accountManagerZoneIds],
  );

  return { bleachers, isLoading };
}
