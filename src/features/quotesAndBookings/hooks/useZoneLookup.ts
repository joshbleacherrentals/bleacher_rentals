"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { unstaffedZoneIds } from "../utils/inboundLeadsZones";
import { STATUSES } from "@/features/manageTeam/constants";
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

/**
 * The zones nobody works: no active account manager (active account manager row and an active
 * user) is assigned to them. Admins see their requests
 * in the Inbound Leads template. Local, from `Zones` and `AccountManagerZones`.
 */
export function useUnstaffedZoneIds(): string[] {
  const zones = useZones();
  const compiled = useMemo(
    () =>
      db
        .selectFrom("AccountManagerZones as amz")
        .innerJoin("AccountManagers as am", "am.id", "amz.account_manager_uuid")
        .innerJoin("Users as u", "u.id", "am.user_uuid")
        .select(["amz.zone_uuid as zone_uuid"])
        .where("am.is_active", "=", 1)
        .where("u.status_uuid", "=", STATUSES.active)
        .compile(),
    [],
  );
  const { data } = useTypedQuery(compiled, expect<{ zone_uuid: string | null }>());
  return useMemo(
    () =>
      unstaffedZoneIds(
        zones.map((z) => z.id),
        (data ?? []).map((r) => r.zone_uuid).filter((id): id is string => id !== null),
      ),
    [zones, data],
  );
}
