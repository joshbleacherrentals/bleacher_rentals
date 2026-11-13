"use client";
import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { STATUSES } from "@/features/manageTeam/constants";
import {
  applyDriverScope,
  NO_DRIVER_MATCH,
  resolveDriverScope,
  type DriverScope,
} from "../db/driverZoneScope";

type Compiled = {
  driver_uuid: string;
  user_uuid: string | null;
  taxDec: number | null;
  pay_rate_cents: number | null;
  setup_cents: number | null;
  teardown_cents: number | null;
  pay_currency: string | null;
  pay_per_unit: string | null;
  is_active: number | null;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status_uuid: string | null;
};

export type DriverWithUser = {
  driver_uuid: string;
  user_uuid: string;
  taxDec: number;
  pay_rate_cents: number;
  setup_cents: number | null;
  teardown_cents: number | null;
  pay_currency: string;
  pay_per_unit: string;
  is_active: boolean;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status_uuid?: string | null;
};

const DRIVER_COLUMNS = [
  "d.id as driver_uuid",
  "d.user_uuid as user_uuid",
  "d.tax_dec as taxDec",
  "d.pay_rate_cents as pay_rate_cents",
  "d.setup_cents as setup_cents",
  "d.teardown_cents as teardown_cents",
  "d.pay_currency as pay_currency",
  "d.pay_per_unit as pay_per_unit",
  "d.is_active as is_active",
  "u.id as user_id",
  "u.first_name as first_name",
  "u.last_name as last_name",
  "u.email as email",
  "u.status_uuid as status_uuid",
] as const;

/**
 * The drivers query. By default only active drivers (active or invited users). With
 * `includeInactive` the two "active" conditions are dropped (Audit lists every driver,
 * docs/specs/accountant-audit-02-driver-select.md D4). The scope always applies.
 */
export function buildDriversQuery(input: {
  currentUser: unknown;
  scope: DriverScope;
  includeInactive: boolean;
}) {
  const base = db
    .selectFrom("Drivers as d")
    .innerJoin("Users as u", "u.id", "d.user_uuid")
    .select([...DRIVER_COLUMNS]);

  // No current user yet: return no rows.
  if (!input.currentUser) return base.where("d.id", "=", NO_DRIVER_MATCH).compile();

  const query = input.includeInactive
    ? base
    : base
        .where("d.is_active", "=", 1)
        .where((eb) =>
          eb.or([
            eb("u.status_uuid", "=", STATUSES.active),
            eb("u.status_uuid", "=", STATUSES.invited),
          ]),
        );
  // Shared scoping rule: admins see everyone, account managers see their zones.
  return applyDriverScope(query, input.scope).orderBy("d.user_uuid", "asc").compile();
}

export function useDrivers(options?: { showAll?: boolean; includeInactive?: boolean }): {
  data: DriverWithUser[] | null;
  isLoading: boolean;
  error: Error | undefined;
} {
  const showAll = options?.showAll ?? false;
  const includeInactive = options?.includeInactive ?? false;
  const { data: currentUserData, isLoading: isCurrentUserLoading } = useCurrentUser();
  const currentUser = currentUserData?.[0];

  // Get account manager ID if user is an account manager
  const accountManagerQuery = useMemo(() => {
    if (!currentUser?.id || currentUser?.is_admin === 1) {
      return null;
    }
    return db
      .selectFrom("AccountManagers")
      .select("id")
      .where("user_uuid", "=", currentUser.id)
      .where("is_active", "=", 1)
      .limit(1)
      .compile();
  }, [currentUser?.id, currentUser?.is_admin]);

  const { data: accountManagerData } = useTypedQuery(
    accountManagerQuery ??
      db.selectFrom("AccountManagers").select("id").where("id", "=", NO_DRIVER_MATCH).compile(),
    expect<{ id: string }>(),
  );

  const compiled = useMemo(
    () =>
      buildDriversQuery({
        currentUser,
        scope: currentUser
          ? resolveDriverScope({
              isAdmin: currentUser.is_admin === 1,
              accountManagerUuid: accountManagerData?.[0]?.id ?? null,
              showAll,
            })
          : { kind: "none" },
        includeInactive,
      }),
    [currentUser, accountManagerData, showAll, includeInactive],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Compiled>());

  const deduped = useMemo(() => {
    if (!data) return null;
    const seen = new Set<string>();
    return (data as unknown as DriverWithUser[]).filter((d) => {
      if (seen.has(d.driver_uuid)) return false;
      seen.add(d.driver_uuid);
      return true;
    });
  }, [data]);

  return {
    data: deduped,
    isLoading: isLoading || isCurrentUserLoading,
    error,
  };
}
