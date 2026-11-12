"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { buildDriverWorkload, type DriverWorkload } from "../utils/driverWorkload";

/** Work trackers that are off: nobody is making the trip, so it adds no driving. */
const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

type Row = {
  driver_uuid: string | null;
  date: string | null;
  drive_minutes: number | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Each driver's driving hours and trips per day for the week beginning `weekStart`, from the local
 * database. A work tracker's hours are its `drive_minutes`.
 */
export function useDriverWorkload(weekStart: string): {
  drivers: DriverWorkload[];
  isLoading: boolean;
} {
  const weekEnd = weekEndOf(weekStart);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("WorkTrackers as w")
        .innerJoin("Drivers as d", "d.id", "w.driver_uuid")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .select([
          "w.driver_uuid as driver_uuid",
          "w.date as date",
          "w.drive_minutes as drive_minutes",
          "u.first_name as first_name",
          "u.last_name as last_name",
        ])
        .where("w.date", ">=", weekStart)
        .where("w.date", "<=", weekEnd)
        .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
        .compile(),
    [weekStart, weekEnd],
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
