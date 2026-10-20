"use client";

import { useMemo } from "react";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import type { InboundLeadsUser } from "../utils/inboundLeadsTemplate";
import { useUnstaffedZoneIds } from "./useZoneLookup";

/**
 * Who is looking, for the My Inbound Leads rule (`matchesInboundLeads`): their id, role and zones,
 * and the zones nobody works. `ready` is false until the unstaffed zones are known; the rule must
 * not be applied before that, or every zone would look unstaffed. `handlesLeads` is whether the
 * person is an admin or an account manager.
 */
export function useInboundLeadsRule(): {
  user: InboundLeadsUser;
  ready: boolean;
  handlesLeads: boolean;
} {
  const userId = usePermissionsStore((s) => s.userId);
  const isAdmin = usePermissionsStore((s) => s.isAdmin);
  const isAccountManager = usePermissionsStore((s) => s.isAccountManager);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const { zoneIds: unstaffedZoneIds, isLoading } = useUnstaffedZoneIds();

  const user = useMemo<InboundLeadsUser>(
    () => ({
      userId: userId ?? null,
      isAdmin,
      isAccountManager,
      accountManagerZoneIds,
      unstaffedZoneIds,
    }),
    [userId, isAdmin, isAccountManager, accountManagerZoneIds, unstaffedZoneIds],
  );
  return { user, ready: !isLoading, handlesLeads: isAdmin || isAccountManager };
}
