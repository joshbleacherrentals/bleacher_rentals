"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { managesZoneQuery } from "../db/driverQueries";
import { canFixZoneData } from "../utils/canFixZoneData";

/** Whether the signed-in user may fix the data of the zone's drivers and events (see canFixZoneData). */
export function useCanFixZoneData(zoneId: string): boolean {
  const access = useUserAccess();
  const isAdmin = access.status === "active" && access.roles.includes("admin");
  const accountManagerId = access.status === "active" ? access.accountManagerId : null;

  const compiled = useMemo(
    () => managesZoneQuery(accountManagerId ?? "", zoneId),
    [accountManagerId, zoneId],
  );
  const { data } = useTypedQuery(compiled, expect<{ id: string }>());
  const managesZone = !!accountManagerId && !!zoneId && (data ?? []).length > 0;

  return canFixZoneData({ isAdmin, managesZone });
}
