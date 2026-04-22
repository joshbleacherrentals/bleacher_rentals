"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { DriverDistanceRow } from "../types";

type YearRow = { year: number | null };

/**
 * Reactive list of distinct years that have data in DriverScorecardStatsPerDriver.
 * Returned descending (newest first).
 */
export function useAvailableYears(): number[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverScorecardStatsPerDriver")
        .select(["year"])
        .groupBy("year")
        .orderBy("year", "desc")
        .compile(),
    [],
  );

  const { data = [] } = useTypedQuery(compiled, expect<YearRow>());
  return data.map((r) => r.year).filter((y): y is number => y !== null);
}

type DriverDistanceQueryRow = {
  driverUuid: string | null;
  firstName: string | null;
  lastName: string | null;
  distanceMeters: number | null;
  driveMinutes: number | null;
  payCents: number | null;
  tripCount: number | null;
};

/**
 * Reactive driver-distance rows for a specific year, joined to Drivers/Users
 * for names. Sorted by distance descending.
 */
export function useDriverDistanceForYear(year: number): DriverDistanceRow[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverScorecardStatsPerDriver as ddpy")
        .innerJoin("Drivers as d", "d.id", "ddpy.driver_uuid")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .select([
          "ddpy.driver_uuid as driverUuid",
          "u.first_name as firstName",
          "u.last_name as lastName",
          "ddpy.distance_meters as distanceMeters",
          "ddpy.drive_minutes as driveMinutes",
          "ddpy.pay_cents as payCents",
          "ddpy.trip_count as tripCount",
        ])
        .where("ddpy.year", "=", year)
        .compile(),
    [year],
  );

  const { data = [] } = useTypedQuery(compiled, expect<DriverDistanceQueryRow>());

  return useMemo(() => {
    const rows: DriverDistanceRow[] = data
      .filter((r): r is DriverDistanceQueryRow & { driverUuid: string } => r.driverUuid !== null)
      .map((r) => ({
        driverUuid: r.driverUuid,
        firstName: r.firstName,
        lastName: r.lastName,
        distanceMeters: r.distanceMeters ?? 0,
        driveMinutes: r.driveMinutes ?? 0,
        payCents: r.payCents ?? 0,
        tripCount: r.tripCount ?? 0,
      }));
    rows.sort((a, b) => b.distanceMeters - a.distanceMeters);
    return rows;
  }, [data]);
}
