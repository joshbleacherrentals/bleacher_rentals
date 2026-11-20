"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { buildDriverWorkload, type DriverWorkload } from "../utils/driverWorkload";
import { driverWorkloadQuery } from "../db/driverQueries";

type Row = {
  driver_uuid: string | null;
  date: string | null;
  drive_minutes: number | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Each driver in the zone's driving hours and trips per day for the week beginning `weekStart`, from
 * the local database. A work tracker's hours are its `drive_minutes`. No zone: no drivers.
 */
export function useDriverWorkload(
  zoneId: string,
  weekStart: string,
): {
  drivers: DriverWorkload[];
  isLoading: boolean;
} {
  const weekEnd = weekEndOf(weekStart);

  const compiled = useMemo(
    () => driverWorkloadQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const drivers = useMemo(() => {
    const trips = (data ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!r.driver_uuid || !date) return [];
      return [
        {
          driverUuid: r.driver_uuid,
          driverName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed driver",
          date,
          driveMinutes: r.drive_minutes,
        },
      ];
    });
    return buildDriverWorkload(trips, weekStart);
  }, [data, weekStart]);

  return { drivers, isLoading };
}
