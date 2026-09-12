import { db } from "@/components/providers/SystemProvider";
import { WITHDRAWN_STATUSES } from "../util/withdrawnTrackers";
import { driverUuidsInAccountManagerZones, NO_DRIVER_MATCH } from "./driverZoneScope";

/**
 * Who a withdrawal count belongs to.
 *
 * Deliberately *not* `resolveDriverScope` from driverZoneScope.ts, even though
 * both answer a question about zones. That one decides which drivers a user may
 * *work with*, and answers "all of them" for an admin or for anyone who ticked
 * "See All Drivers". These counts are a nag about work that now needs
 * re-covering, so they follow whose zones the drivers are in and nothing else:
 * an admin with no zones is shown no number, and the See All Drivers toggle
 * does not widen the count out from under the badge next to each driver.
 */
export type WithdrawnScope =
  /** Count only drivers sharing a zone with this account manager. */
  | { kind: "zones"; accountManagerUuid: string }
  /** Not an active account manager — there is no number to show. */
  | { kind: "none" };

export function resolveWithdrawnScope(input: {
  isAdmin: boolean;
  accountManagerUuid: string | null;
}): WithdrawnScope {
  if (input.accountManagerUuid) {
    return { kind: "zones", accountManagerUuid: input.accountManagerUuid };
  }
  return { kind: "none" };
}

/**
 * Every tracker a driver in this scope declined or abandoned, for all time.
 *
 * One query behind all three counts — the total, the per-week and the
 * per-driver — so the three numbers are arithmetic on the same rows and cannot
 * disagree. It is also the only place the scope turns into SQL, which is why it
 * is a plain function rather than something built inside a hook: the filter can
 * be asserted without a database or a React tree.
 */
export function withdrawnTrackersQuery(scope: WithdrawnScope) {
  const base = db
    .selectFrom("WorkTrackers as wt")
    .select(["wt.driver_uuid as driver_uuid", "wt.date as date", "wt.status as status"])
    .where("wt.status", "in", [...WITHDRAWN_STATUSES]);

  if (scope.kind === "none") {
    return base.where("wt.driver_uuid", "=", NO_DRIVER_MATCH).compile();
  }

  return base
    .where("wt.driver_uuid", "in", driverUuidsInAccountManagerZones(scope.accountManagerUuid))
    .compile();
}
