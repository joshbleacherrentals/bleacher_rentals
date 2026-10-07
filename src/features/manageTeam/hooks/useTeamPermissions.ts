"use client";

import { useUserAccess } from "@/features/userAccess/client";
import type { UserAccessState } from "@/features/userAccess/hooks/useUserAccess";

export type TeamPermissions = {
  isAdmin: boolean;
  isAccountManager: boolean;
  /** Holds the accountant role and is not an admin (docs/specs/accountant-team.md). */
  isAccountant: boolean;
  /**
   * May open the profile of any team member, not only a driver: an admin, an account manager or a
   * viewer. An accountant alone may open drivers only.
   */
  canOpenAnyProfile: boolean;
  isMaintainer: boolean;
  userId: string | null;
  accountManagerId: string | null;
  canCreateUser: boolean;
};

const NO_PERMISSIONS: TeamPermissions = {
  isAdmin: false,
  isAccountManager: false,
  isAccountant: false,
  canOpenAnyProfile: false,
  isMaintainer: false,
  userId: null,
  accountManagerId: null,
  canCreateUser: false,
};

/** What the roles of the signed-in user allow on the Team page. Pure, so it is tested without React. */
export function toTeamPermissions(access: UserAccessState): TeamPermissions {
  if (access.status !== "active") return NO_PERMISSIONS;

  const isAdmin = access.roles.includes("admin");
  const isAccountManager = access.roles.includes("account_manager");
  const isViewer = access.roles.includes("viewer");
  const isAccountant = access.roles.includes("accountant");

  return {
    isAdmin,
    isAccountManager: isAccountManager && !isAdmin,
    isAccountant: isAccountant && !isAdmin,
    canOpenAnyProfile: isAdmin || isAccountManager || isViewer,
    isMaintainer: access.roles.includes("maintainer"),
    userId: access.userId,
    accountManagerId: access.accountManagerId,
    canCreateUser: isAdmin || isAccountManager,
  };
}

export function useTeamPermissions(): TeamPermissions {
  return toTeamPermissions(useUserAccess());
}

/**
 * Determine if the current user can edit a specific team member.
 *
 * @param permissions - from useTeamPermissions()
 * @param targetUser  - the user being viewed/edited
 *
 * Returns:
 *  - "full"             full edit access to every field
 *  - "zones-only"       only the driver's zone assignment may be changed (all other fields locked)
 *  - "driver-only"      an accountant on a driver: payment info, vendor and driver type
 *                       (docs/specs/accountant-team.md)
 *  - "zones-and-driver" an account manager who is also an accountant, on a driver outside their
 *                       zones: the zone assignment and what "driver-only" has (spec D9)
 *  - "read-only"        no edits
 */
export type EditAccess = "full" | "zones-only" | "driver-only" | "zones-and-driver" | "read-only";

/**
 * Which blocks of the driver page a level leaves editable.
 *
 * For the three partial levels the form wrapper blocks the pointer (`lockedWithExceptions`), and a
 * block that stays editable opts back in with `pointer-events-auto`. `read-only` is locked by the
 * form's own read-only rule, and `full` is not locked at all.
 */
export type EditCapabilities = {
  lockedWithExceptions: boolean;
  /** The zones selector. */
  zones: boolean;
  /** Vendor, driver type, currency, unit, tax, pay rates and tiers, deadhead, setup, teardown. */
  paymentAndVendor: boolean;
  /** Phone, home address, vehicle and documents. */
  driverSetup: boolean;
};

export function getEditCapabilities(access: EditAccess): EditCapabilities {
  switch (access) {
    case "full":
      return {
        lockedWithExceptions: false,
        zones: true,
        paymentAndVendor: true,
        driverSetup: true,
      };
    case "zones-only":
      return {
        lockedWithExceptions: true,
        zones: true,
        paymentAndVendor: false,
        driverSetup: false,
      };
    case "driver-only":
      return {
        lockedWithExceptions: true,
        zones: false,
        paymentAndVendor: true,
        driverSetup: false,
      };
    case "zones-and-driver":
      return {
        lockedWithExceptions: true,
        zones: true,
        paymentAndVendor: true,
        driverSetup: false,
      };
    case "read-only":
      return {
        lockedWithExceptions: false,
        zones: false,
        paymentAndVendor: false,
        driverSetup: false,
      };
  }
}

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
  const base = getBaseEditAccess(permissions, targetUserUuid, targetUser, accountManagerZoneIds);
  if (base === "full") return "full";

  // The accountant's rights come on top of whatever the other roles give (roles add up), and only
  // on a driver: the profile of anyone else is read-only for an accountant.
  if (permissions.isAccountant && targetUser.isDriver) {
    return base === "zones-only" ? "zones-and-driver" : "driver-only";
  }

  return base;
}

/** What the admin and account-manager roles give; the accountant's part is added by the caller. */
function getBaseEditAccess(
  permissions: TeamPermissions,
  targetUserUuid: string | null,
  targetUser: {
    isDriver: boolean;
    accountManagerUuid: string | null;
    assignedDriverZoneUuids: string[];
    hasNoRoles?: boolean;
  },
  accountManagerZoneIds: string[],
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
