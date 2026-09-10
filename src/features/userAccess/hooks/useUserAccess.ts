"use client";
import { useUser } from "@clerk/nextjs";
import {
  determineUserAccess,
  type AccessResult,
  type WebRole,
  type BlockedReason,
} from "../logic/determineAccess";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import type { UserAccessData } from "../types";

export type { UserAccessData } from "../types";

export type UserAccessState =
  | { status: "loading" }
  | { status: "blocked"; reason: BlockedReason }
  | { status: "active"; roles: WebRole[]; userId: string; accountManagerId: string | null };

// These blocked reasons can be a false negative when the signed-in user's own
// role rows (e.g. their Drivers row) are not synced to this client by PowerSync.
// A driver-only user, for instance, may have no role rows in the local DB and
// would otherwise be told "no roles assigned" instead of seeing DriverWelcome.
const FALLBACK_REASONS: BlockedReason[] = ["no-roles-assigned", "cannot-find-account"];

export function useUserAccess(): UserAccessState {
  const { user } = useUser();
  const clerkUserId = user?.id ?? null;
  const supabase = useClerkSupabaseClient();

  const clerkUserIdForQuery = clerkUserId ?? "__no_clerk_user__";

  const compiled = useMemo(() => {
    return db
      .selectFrom("Users as u")
      .leftJoin("AccountManagers as am", (join) =>
        join.onRef("am.user_uuid", "=", "u.id").on("am.is_active", "=", 1),
      )
      .leftJoin("Drivers as d", (join) =>
        join.onRef("d.user_uuid", "=", "u.id").on("d.is_active", "=", 1),
      )
      .leftJoin("Developers as dev", (join) =>
        join.onRef("dev.user_uuid", "=", "u.id").on("dev.is_active", "=", 1),
      )
      .leftJoin("Maintainers as maint", (join) =>
        join.onRef("maint.user_uuid", "=", "u.id").on("maint.is_active", "=", 1),
      )
      .select([
        "u.id as id",
        "u.status_uuid",
        "u.is_admin as is_admin",
        "u.is_viewer as is_viewer",
        "am.id as account_manager_id",
        "d.id as driver_id",
        "dev.id as developer_id",
        "maint.id as maintainer_id",
      ])
      .where("u.clerk_user_id", "=", clerkUserIdForQuery)
      .limit(1)
      .compile();
  }, [clerkUserIdForQuery]);

  const { data, isLoading, error } = useTypedQuery(compiled, expect<UserAccessData>());

  if (process.env.NODE_ENV !== "production" && error) {
    console.warn("[useUserAccess] query error:", error);
  }

  const localState: UserAccessState = useMemo(() => {
    if (!clerkUserId || isLoading) return { status: "loading" };
    if (error || !data?.[0]) return { status: "blocked", reason: "cannot-find-account" };
    return determineUserAccess(data[0]);
  }, [clerkUserId, isLoading, error, data]);

  const needsFallback =
    localState.status === "blocked" && FALLBACK_REASONS.includes(localState.reason);

  // Authoritative online re-check for the false-negative blocked cases above.
  // Keyed by clerkUserId so a resolved fallback is never shown for another user.
  const [fallback, setFallback] = useState<{ clerkUserId: string; result: AccessResult } | null>(
    null,
  );

  useEffect(() => {
    if (!clerkUserId || !needsFallback) {
      setFallback(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: row, error: fetchError } = await supabase
        .from("Users")
        .select(
          `
          id,
          status_uuid,
          is_admin,
          is_viewer,
          AccountManagers!AccountManagers_user_uuid_fkey(id, is_active),
          Drivers!Drivers_user_uuid_fkey(id, is_active),
          Developers!Developers_user_uuid_fkey(id, is_active),
          Maintainers!maintainers_user_uuid_fkey(id, is_active)
        `,
        )
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError || !row) {
        setFallback({
          clerkUserId,
          result: { status: "blocked", reason: "cannot-find-account" },
        });
        return;
      }

      const activeId = (rows: { id: string; is_active: boolean | null }[] | null) =>
        rows?.find((r) => r.is_active)?.id ?? null;

      const mapped: UserAccessData = {
        id: row.id,
        status_uuid: row.status_uuid,
        is_admin: row.is_admin ? 1 : 0,
        is_viewer: row.is_viewer ? 1 : 0,
        account_manager_id: activeId(row.AccountManagers),
        driver_id: activeId(row.Drivers),
        developer_id: activeId(row.Developers),
        maintainer_id: activeId(row.Maintainers),
      };

      setFallback({ clerkUserId, result: determineUserAccess(mapped) });
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkUserId, needsFallback, supabase]);

  if (!needsFallback) return localState;

  // While the authoritative check is in flight, stay on the loading screen so we
  // don't flash "No roles assigned" before resolving to e.g. DriverWelcome.
  if (!fallback || fallback.clerkUserId !== clerkUserId) return { status: "loading" };

  return fallback.result;
}
