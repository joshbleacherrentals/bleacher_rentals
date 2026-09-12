import { db } from "@/components/providers/SystemProvider";

/**
 * Single source of truth for "which drivers can this user work with".
 *
 * Drivers are no longer attached to an account manager directly — both drivers and
 * account managers are attached to zones. A driver is "mine" when at least one of
 * their zones is one of my zones.
 *
 * Used by the work tracker driver dropdown (`useDrivers`) and by the weekly work
 * tracker list (`useDriversForWeek`) so both stay in sync.
 */

/** Sentinel used to force a query to return no rows. */
export const NO_DRIVER_MATCH = "__no_match__";

export type DriverScope =
  /** See every active driver (admins, or an explicit "See All Drivers" toggle). */
  | { kind: "all" }
  /** See only drivers sharing a zone with this account manager. */
  | { kind: "zones"; accountManagerUuid: string }
  /** Not an admin and not an active account manager — see nothing. */
  | { kind: "none" };

export function resolveDriverScope(input: {
  isAdmin: boolean;
  accountManagerUuid: string | null;
  showAll: boolean;
}): DriverScope {
  if (input.showAll || input.isAdmin) return { kind: "all" };
  if (input.accountManagerUuid) {
    return { kind: "zones", accountManagerUuid: input.accountManagerUuid };
  }
  return { kind: "none" };
}

/** Driver uuids that share at least one zone with the given account manager. */
export function driverUuidsInAccountManagerZones(accountManagerUuid: string) {
  return db
    .selectFrom("DriverZones as dz")
    .innerJoin("AccountManagerZones as amz", "amz.zone_uuid", "dz.zone_uuid")
    .select("dz.driver_uuid")
    .where("amz.account_manager_uuid", "=", accountManagerUuid);
}

/**
 * Applies the scope to a query selecting from `Drivers as d`.
 * Uses a sub-select (not a join) so a driver in several of my zones is not duplicated.
 */
export function applyDriverScope<Q extends { where: (...args: never[]) => unknown }>(
  query: Q,
  scope: DriverScope,
): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any;
  switch (scope.kind) {
    case "all":
      return q;
    case "zones":
      return q.where("d.id", "in", driverUuidsInAccountManagerZones(scope.accountManagerUuid));
    case "none":
      return q.where("d.id", "=", NO_DRIVER_MATCH);
  }
}
