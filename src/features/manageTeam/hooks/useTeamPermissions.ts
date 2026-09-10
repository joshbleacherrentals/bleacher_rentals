"use client";

import { useUserAccess } from "@/features/userAccess/client";

export type TeamPermissions = {
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
  userId: string | null;
  accountManagerId: string | null;
  canCreateUser: boolean;
  canAssignAdmin: boolean;
};

export function useTeamPermissions(): TeamPermissions {
  const access = useUserAccess();

  if (access.status !== "active") {
    return {
      isAdmin: false,
      isAccountManager: false,
      isMaintainer: false,
      userId: null,
      accountManagerId: null,
      canCreateUser: false,
      canAssignAdmin: false,
    };
  }

  const isAdmin = access.roles.includes("admin");
  const isAccountManager = access.roles.includes("account_manager");

  return {
    isAdmin,
    isAccountManager: isAccountManager && !isAdmin,
    isMaintainer: access.roles.includes("maintainer"),
    userId: access.userId,
    accountManagerId: access.accountManagerId,
    canCreateUser: isAdmin || isAccountManager,
    canAssignAdmin: isAdmin,
  };
}

/**
 * Determine if the current user can edit a specific team member.
 *
 * @param permissions - from useTeamPermissions()
 * @param targetUser  - the user being viewed/edited
 *
 * Returns:
 *  - "full"       full edit access to every field
 *  - "zones-only" only the driver's zone assignment may be changed (all other fields locked)
 *  - "read-only"  no edits
 */
export type EditAccess = "full" | "zones-only" | "read-only";

export function getEditAccess(
  permissions: TeamPermissions,
  targetUserUuid: string | null,
  targetUser: {
    isDriver: boolean;
    accountManagerUuid: string | null;
    assignedDriverZoneUuids: string[];
    /** True when the user has no role assigned yet (not admin/AM/driver/developer/viewer) —
     * see useIncomplete.ts for the matching query. Any active AM may claim and configure
     * these, same as an admin, so incomplete signups don't get stuck waiting on an admin. */
    hasNoRoles?: boolean;
  },
  accountManagerZoneIds: string[] = [],
): EditAccess {
  if (permissions.isAdmin) return "full";

  if (permissions.isAccountManager) {
    // AM can edit own profile
    if (targetUserUuid && targetUserUuid === permissions.userId) return "full";

    if (targetUser.hasNoRoles) return "full";

    if (targetUser.isDriver) {
      // A driver already in one of the AM's zones is fully editable (mirrors the
      // zone-based drivers_update RLS). Otherwise the AM may still add the driver to
      // their zone, but nothing else — the driver's other fields stay locked.
      const sharesZone = targetUser.assignedDriverZoneUuids.some((z) =>
        accountManagerZoneIds.includes(z),
      );
      return sharesZone ? "full" : "zones-only";
    }
  }

  return "read-only";
}
