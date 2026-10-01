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
 * Whether an account manager may hand each role out. An admin may hand out all of them.
 *
 * This mirrors what an account manager's save is able to write, not a product preference:
 * `Developers`, `Maintainers` and `Accountants` are admin-only under RLS and `Users.is_admin`
 * is an admin's call, so offering any of those would end in a refused write after the
 * `Users` row already exists. A `Record`, so a new `TeamRoleTab` does not compile until
 * someone has decided who may grant it.
 */
const ACCOUNT_MANAGER_MAY_ASSIGN: Record<TeamRoleTab, boolean> = {
  administrator: false,
  "account-manager": true,
  driver: true,
  developer: false,
  viewer: true,
  maintainer: false,
  accountant: false,
};

/**
 * The roles still offered under `+ Add Role`: the ones the user does not hold yet, and that
 * this actor is allowed to grant.
 */
export function getAvailableRoles(
  roleTabs: TeamRoleTab[],
  actor: Pick<TeamPermissions, "isAdmin" | "isAccountManager">,
): TeamRoleTab[] {
  return ALL_ROLES.filter(
    (role) =>
      !roleTabs.includes(role) &&
      (actor.isAdmin || (actor.isAccountManager && ACCOUNT_MANAGER_MAY_ASSIGN[role])),
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
