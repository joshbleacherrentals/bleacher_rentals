import type { TeamRoleTab } from "../state/useCurrentUserStore";
import type { TeamPermissions } from "../hooks/useTeamPermissions";

/** Every role a team member can be given, in the order `+ Add Role` lists them. */
export const ALL_ROLES: TeamRoleTab[] = [
  "administrator",
  "account-manager",
  "driver",
  "developer",
  "viewer",
  "maintainer",
  "accountant",
];

/**
 * The roles still offered under `+ Add Role`: the ones the user does not hold yet, minus
 * the ones this actor may not grant. Administrator and Accountant are admin-only — the
 * `Accountants` table is admin-only under RLS, so offering Accountant to anyone else would
 * end in a refused insert after the `Users` row already exists
 * (docs/specs/accountant-role.md, D2).
 */
export function getAvailableRoles(
  roleTabs: TeamRoleTab[],
  permissions: Pick<TeamPermissions, "canAssignAdmin" | "canAssignAccountant">,
): TeamRoleTab[] {
  return ALL_ROLES.filter(
    (role) =>
      !roleTabs.includes(role) &&
      (role !== "administrator" || permissions.canAssignAdmin) &&
      (role !== "accountant" || permissions.canAssignAccountant),
  );
}

/**
 * True when the user being edited holds no role yet — the same idea as the query in
 * `useIncomplete.ts`, which an active account manager may claim and configure.
 *
 * `isMaintainer` is not part of this yet: that gap predates the accountant role and is
 * reported, not changed, by docs/specs/accountant-role.md (§9).
 */
export function hasNoRoles(flags: {
  isAdmin: boolean;
  isViewer: boolean;
  isDriver: boolean;
  isAccountManager: boolean;
  isDeveloper: boolean;
  isAccountant: boolean;
}): boolean {
  return (
    !flags.isAdmin &&
    !flags.isViewer &&
    !flags.isDriver &&
    !flags.isAccountManager &&
    !flags.isDeveloper &&
    !flags.isAccountant
  );
}
