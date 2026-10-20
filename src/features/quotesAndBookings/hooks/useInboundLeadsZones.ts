"use client";

import { useMemo } from "react";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { inboundLeadsZones } from "../utils/inboundLeadsZones";
import { useUnstaffedZoneIds } from "./useZoneLookup";

/**
 * The zones the Inbound Leads template covers for the signed-in user (see `inboundLeadsZones`), and
 * whether the user handles inbound leads at all (an admin or an account manager).
 */
export function useInboundLeadsZones(): { zones: string[]; handlesLeads: boolean } {
  const isAdmin = usePermissionsStore((s) => s.isAdmin);
  const isAccountManager = usePermissionsStore((s) => s.isAccountManager);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const unstaffedZones = useUnstaffedZoneIds();

  const zones = useMemo(
    () =>
      inboundLeadsZones({
        isAdmin,
        isAccountManager,
        accountManagerZoneIds,
        unstaffedZoneIds: unstaffedZones,
      }),
    [isAdmin, isAccountManager, accountManagerZoneIds, unstaffedZones],
  );
  return { zones, handlesLeads: isAdmin || isAccountManager };
}
