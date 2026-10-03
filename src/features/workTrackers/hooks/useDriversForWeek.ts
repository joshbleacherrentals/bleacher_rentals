"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { DriverWithMeta } from "../db/db";
import { applyDriverScope, resolveDriverScope, type DriverScope } from "../db/driverZoneScope";
import { matchesPayCurrency, type PayCurrencyFilter } from "../util/payCurrencyFilter";
import { deriveRegion, isUsaAddress } from "../util/addressCountry";
import { seesAllDriversAlways } from "../util/workTrackerPageAccess";

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Access (admin / account manager / accountant) — reactive replacement for checkUserAccess
// ---------------------------------------------------------------------------

type AccessRow = {
  is_admin: number | null;
  account_manager_id: string | null;
  accountant_id: string | null;
};

export type WorkTrackerAccess = {
  isAdmin: boolean;
  isAccountManager: boolean;
  isAccountant: boolean;
  accountManagerUuid: string | null;
};

/** Exported so a test can run the compiled SQL against a real SQLite database. */
export function buildWorkTrackerAccessQuery(currentUserUuid: string | null) {
  return db
    .selectFrom("Users as u")
    .leftJoin("AccountManagers as am", (join) =>
      join.onRef("am.user_uuid", "=", "u.id").on("am.is_active", "=", 1),
    )
    .leftJoin("Accountants as acct", (join) =>
      join.onRef("acct.user_uuid", "=", "u.id").on("acct.is_active", "=", 1),
    )
    .select(["u.is_admin as is_admin", "am.id as account_manager_id", "acct.id as accountant_id"])
    .where("u.id", "=", currentUserUuid ?? NONE)
    .limit(1)
    .compile();
}

export function toWorkTrackerAccess(
  currentUserUuid: string | null,
  rows: AccessRow[] | undefined,
): WorkTrackerAccess | null {
  if (!currentUserUuid) return null;
  const row = rows?.[0];
  if (!row) {
    return {
      isAdmin: false,
      isAccountManager: false,
      isAccountant: false,
      accountManagerUuid: null,
    };
  }
  const isAccountManager = !!row.account_manager_id;
  return {
    isAdmin: !!row.is_admin,
    isAccountManager,
    isAccountant: !!row.accountant_id,
    accountManagerUuid: isAccountManager ? row.account_manager_id : null,
  };
}

export function useWorkTrackerAccess(currentUserUuid: string | null): {
  access: WorkTrackerAccess | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => buildWorkTrackerAccessQuery(currentUserUuid), [currentUserUuid]);

  const { data, isLoading } = useTypedQuery(compiled, expect<AccessRow>());

  const access = useMemo(() => toWorkTrackerAccess(currentUserUuid, data), [currentUserUuid, data]);

  return { access, isLoading };
}

// ---------------------------------------------------------------------------
// Drivers for week — reactive replacement for fetchDriversForWeek
// ---------------------------------------------------------------------------

type DriverRow = {
  driver_uuid: string;
  pay_currency: string | null;
  pay_per_unit: string | null;
  taxDec: number | null;
  driver_street: string | null;
  driver_country: string | null;
  qbo_connection_uuid: string | null;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type TrackerAggRow = {
  driver_uuid: string | null;
  pay_cents: number | null;
  distance_meters: number | null;
  drive_minutes: number | null;
  dropoff_street: string | null;
  dropoff_country: string | null;
};

type GroupRow = {
  id: string;
  driver_uuid: string | null;
  status: string | null;
  qbo_bill_id: string | null;
  week_start: string | null;
  week_end: string | null;
  is_paid: number | null;
};

export function useDriversForWeek(
  startDate: string,
  showAllDrivers: boolean,
  access: WorkTrackerAccess | null,
  enabled: boolean,
  payCurrencyFilter: PayCurrencyFilter = "ALL",
): { drivers: DriverWithMeta[]; isLoading: boolean } {
  const isAdmin = access?.isAdmin ?? false;
  const accountManagerUuid = access?.accountManagerUuid ?? null;
  // An accountant has no zones and pays every driver: "See All Drivers" is always on for them.
  const showAll =
    showAllDrivers || seesAllDriversAlways({ isAccountant: access?.isAccountant ?? false });

  const driversCompiled = useMemo(() => {
    const base = db
      .selectFrom("Drivers as d")
      .innerJoin("Users as u", "u.id", "d.user_uuid")
      .leftJoin("Addresses as a", "a.id", "d.address_uuid")
      .leftJoin("Vendors as v", "v.id", "d.vendor_uuid")
      .select([
        "d.id as driver_uuid",
        "d.pay_currency as pay_currency",
        "d.pay_per_unit as pay_per_unit",
        "d.tax_dec as taxDec",
        "a.street as driver_street",
        "a.country as driver_country",
        "v.qbo_connection_uuid as qbo_connection_uuid",
        "u.id as user_id",
        "u.first_name as first_name",
        "u.last_name as last_name",
      ])
      .where("d.is_active", "=", 1);

    // Keep the query inert until access is resolved.
    const scope: DriverScope = enabled
      ? resolveDriverScope({ isAdmin, accountManagerUuid, showAll })
      : { kind: "none" };

    return applyDriverScope(base, scope).compile();
  }, [showAll, isAdmin, accountManagerUuid, enabled]);

  const { data: driverRows, isLoading: driversLoading } = useTypedQuery(
    driversCompiled,
    expect<DriverRow>(),
  );

  const trackersCompiled = useMemo(() => {
    const endDate = DateTime.fromISO(startDate).plus({ days: 7 }).toISODate() ?? startDate;
    return db
      .selectFrom("WorkTrackers as wt")
      .leftJoin("Addresses as dropoff", "dropoff.id", "wt.dropoff_address_uuid")
      .select([
        "wt.driver_uuid as driver_uuid",
        "wt.pay_cents as pay_cents",
        "wt.distance_meters as distance_meters",
        "wt.drive_minutes as drive_minutes",
        "dropoff.street as dropoff_street",
        "dropoff.country as dropoff_country",
      ])
      .where("wt.date", ">=", startDate)
      .where("wt.date", "<", endDate)
      .compile();
  }, [startDate]);

  const { data: trackerRows, isLoading: trackersLoading } = useTypedQuery(
    trackersCompiled,
    expect<TrackerAggRow>(),
  );

  const groupsCompiled = useMemo(() => {
    const weekEnd = DateTime.fromISO(startDate).plus({ days: 6 }).toISODate() ?? startDate;
    return db
      .selectFrom("WorkTrackerGroups as g")
      .select([
        "g.id as id",
        "g.driver_uuid as driver_uuid",
        "g.status as status",
        "g.qbo_bill_id as qbo_bill_id",
        "g.week_start as week_start",
        "g.week_end as week_end",
        "g.is_paid as is_paid",
      ])
      .where("g.week_start", "=", startDate)
      .where("g.week_end", "=", weekEnd)
      .compile();
  }, [startDate]);

  const { data: groupRows, isLoading: groupsLoading } = useTypedQuery(
    groupsCompiled,
    expect<GroupRow>(),
  );

  const drivers = useMemo<DriverWithMeta[]>(() => {
    if (!enabled || !driverRows) return [];

    const tripCounts = new Map<string, number>();
    const payCents = new Map<string, number>();
    const distanceMeters = new Map<string, number>();
    const driveMinutes = new Map<string, number>();
    const usaDropoffDriverIds = new Set<string>();
    for (const wt of trackerRows ?? []) {
      if (!wt.driver_uuid) continue;
      tripCounts.set(wt.driver_uuid, (tripCounts.get(wt.driver_uuid) ?? 0) + 1);
      payCents.set(wt.driver_uuid, (payCents.get(wt.driver_uuid) ?? 0) + (wt.pay_cents ?? 0));
      distanceMeters.set(
        wt.driver_uuid,
        (distanceMeters.get(wt.driver_uuid) ?? 0) + (wt.distance_meters ?? 0),
      );
      driveMinutes.set(
        wt.driver_uuid,
        (driveMinutes.get(wt.driver_uuid) ?? 0) + (wt.drive_minutes ?? 0),
      );
      if (isUsaAddress(wt.dropoff_country, wt.dropoff_street))
        usaDropoffDriverIds.add(wt.driver_uuid);
    }

    const groupsByDriver = new Map<string, GroupRow>();
    for (const g of groupRows ?? []) {
      if (g.driver_uuid) groupsByDriver.set(g.driver_uuid, g);
    }

    const result = driverRows
      .filter((driver) => matchesPayCurrency(driver.pay_currency, payCurrencyFilter))
      .map((driver) => {
        const region = deriveRegion(driver.driver_country, driver.driver_street);
        const group = groupsByDriver.get(driver.driver_uuid);
        return {
          id: driver.user_id,
          first_name: driver.first_name,
          last_name: driver.last_name,
          driver_uuid: driver.driver_uuid,
          tripCount: tripCounts.get(driver.driver_uuid) ?? 0,
          totalPayCents: payCents.get(driver.driver_uuid) ?? 0,
          payCurrency: driver.pay_currency ?? "USD",
          payPerUnit: driver.pay_per_unit ?? "KM",
          totalDistanceMeters: distanceMeters.get(driver.driver_uuid) ?? 0,
          totalDriveMinutes: driveMinutes.get(driver.driver_uuid) ?? 0,
          hasCrossBorderTrips: region === "CAN" && usaDropoffDriverIds.has(driver.driver_uuid),
          region,
          taxDec: driver.taxDec ?? 0,
          qbo_connection_uuid: driver.qbo_connection_uuid ?? null,
          workTrackerGroup: group
            ? {
                id: group.id,
                status: group.status,
                qbo_bill_id: group.qbo_bill_id,
                week_start: group.week_start,
                week_end: group.week_end,
                is_paid: !!group.is_paid,
              }
            : null,
        } as unknown as DriverWithMeta;
      });

    result.sort((a, b) => {
      if (b.tripCount !== a.tripCount) return b.tripCount - a.tripCount;
      return (a.first_name ?? "").localeCompare(b.first_name ?? "");
    });

    return result;
  }, [enabled, driverRows, trackerRows, groupRows, payCurrencyFilter]);

  return {
    drivers,
    isLoading: driversLoading || trackersLoading || groupsLoading,
  };
}
