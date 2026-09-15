"use client";

import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  countWithdrawn,
  countWithdrawnByDriver,
  countWithdrawnByWeek,
  type WithdrawnTrackerRow,
} from "../util/withdrawnTrackers";
import {
  resolveWithdrawnScope,
  withdrawnTrackersQuery,
  type WithdrawnScope,
} from "./withdrawnTrackerScope";

const NO_CLERK_USER = "__no_clerk_user__";

type ScopeRow = { is_admin: number | null; account_manager_uuid: string | null };

/**
 * The signed-in user's withdrawal scope: the zones they manage, or nothing.
 *
 * Resolved from the local DB rather than passed in, so the sidebar, the week
 * list and the driver list all arrive at the same scope without threading the
 * account manager uuid through three unrelated component trees.
 */
export function useWithdrawnScope(): WithdrawnScope {
  const { user } = useUser();
  const clerkUserId = user?.id ?? NO_CLERK_USER;

  const compiled = useMemo(
    () =>
      db
        .selectFrom("Users as u")
        .leftJoin("AccountManagers as am", (join) =>
          join.onRef("am.user_uuid", "=", "u.id").on("am.is_active", "=", 1),
        )
        .select(["u.is_admin as is_admin", "am.id as account_manager_uuid"])
        .where("u.clerk_user_id", "=", clerkUserId)
        .limit(1)
        .compile(),
    [clerkUserId],
  );

  const { data } = useTypedQuery(compiled, expect<ScopeRow>());
  const row = data?.[0] ?? null;

  return useMemo(
    () =>
      resolveWithdrawnScope({
        isAdmin: !!row?.is_admin,
        accountManagerUuid: row?.account_manager_uuid ?? null,
      }),
    [row?.is_admin, row?.account_manager_uuid],
  );
}

/**
 * Every tracker a driver in my zones walked away from, for all time.
 *
 * One reactive query behind all three counts. The rows are the exceptions, not
 * the workload — a week where nothing was declined contributes nothing — so
 * carrying them in memory costs less than three separate live queries, and it
 * makes the three numbers arithmetically consistent by construction. Because
 * the query is live, a tracker deleted in Supabase leaves the local table and
 * every count that mentioned it drops in the same tick; delete the last one and
 * the badge disappears on its own.
 */
export function useWithdrawnTrackers(): { rows: WithdrawnTrackerRow[]; isLoading: boolean } {
  const scope = useWithdrawnScope();

  const compiled = useMemo(() => withdrawnTrackersQuery(scope), [scope]);

  const { data, isLoading } = useTypedQuery(compiled, expect<WithdrawnTrackerRow>());

  return { rows: data ?? [], isLoading };
}

/** Total declined + abandoned trackers in my zones, all time. Feeds the sidebar badge. */
export function useWithdrawnCount(): number {
  const { rows } = useWithdrawnTrackers();
  return useMemo(() => countWithdrawn(rows), [rows]);
}

/**
 * Declined + abandoned per week in my zones, keyed by the Monday of the
 * tracker's own date. A week with none is absent, not 0.
 */
export function useWithdrawnCountsByWeek(): Map<string, number> {
  const { rows } = useWithdrawnTrackers();
  return useMemo(() => countWithdrawnByWeek(rows), [rows]);
}

/**
 * Declined + abandoned per driver for one week, keyed by driver uuid. Pass the
 * Monday the week starts on; a driver with none is absent, not 0.
 */
export function useWithdrawnCountsByDriver(weekStart: string | null): Map<string, number> {
  const { rows } = useWithdrawnTrackers();
  return useMemo(() => countWithdrawnByDriver(rows, weekStart), [rows, weekStart]);
}
