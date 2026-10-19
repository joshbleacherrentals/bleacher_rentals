"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { buildZoneByState } from "../utils/zoneOfEvent";

type ZoneRow = { id: string; display_name: string | null };
type ZoneStateRow = { state_province: string | null; zone_uuid: string | null };

/** The zones, in name order, for the zone filter and its chip. Local, like everything else. */
export function useZones(): { id: string; name: string }[] {
  const compiled = useMemo(
    () => db.selectFrom("Zones").select(["id", "display_name"]).orderBy("display_name").compile(),
    [],
  );
  const { data } = useTypedQuery(compiled, expect<ZoneRow>());
  return useMemo(
    () => (data ?? []).map((z) => ({ id: z.id, name: z.display_name ?? "Unnamed zone" })),
    [data],
  );
}

/** Zone names by id, for the applied-filter chip. */
export function useZoneNames(): Map<string, string> {
  const zones = useZones();
  return useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);
}

/** state or province (normalized) → zone id, from `ZoneStateProvinces`. */
export function useZoneByState(): Map<string, string> {
  const compiled = useMemo(
    () => db.selectFrom("ZoneStateProvinces").select(["state_province", "zone_uuid"]).compile(),
    [],
  );
  const { data } = useTypedQuery(compiled, expect<ZoneStateRow>());
  return useMemo(() => buildZoneByState(data ?? []), [data]);
}
