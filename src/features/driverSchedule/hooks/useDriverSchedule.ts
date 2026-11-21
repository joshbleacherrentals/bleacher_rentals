"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { driverNameQuery, driverScheduleQuery } from "../db/driverScheduleQuery";
import { layoutSchedule, type ScheduleDay, type ScheduleTracker } from "../utils/scheduleLayout";

type Row = {
  id: string;
  date: string | null;
  previous_work_tracker_uuid: string | null;
  planned_pickup_at: string | null;
  planned_dropoff_at: string | null;
  drive_minutes: number | null;
  deadhead_in_drive_minutes: number | null;
  return_home_drive_minutes: number | null;
  bleacher_number: number | null;
  pickup_street: string | null;
  dropoff_street: string | null;
};

/** A driver's week laid out for the schedule grid (layoutSchedule), from the local database. */
export function useDriverSchedule(
  userUuid: string,
  weekStart: string,
): { days: ScheduleDay[]; driverName: string | null; isLoading: boolean } {
  const weekEnd = weekEndOf(weekStart);
  const compiled = useMemo(
    () => driverScheduleQuery(userUuid, weekStart, weekEnd),
    [userUuid, weekStart, weekEnd],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const nameCompiled = useMemo(() => driverNameQuery(userUuid), [userUuid]);
  const { data: names } = useTypedQuery(
    nameCompiled,
    expect<{ first_name: string | null; last_name: string | null }>(),
  );

  const days = useMemo(() => {
    const trackers: ScheduleTracker[] = (data ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!date) return [];
      return [
        {
          id: r.id,
          date,
          previousId: r.previous_work_tracker_uuid,
          plannedPickupAt: r.planned_pickup_at,
          plannedDropoffAt: r.planned_dropoff_at,
          haulMinutes: r.drive_minutes,
          deadheadInMinutes: r.deadhead_in_drive_minutes,
          returnHomeMinutes: r.return_home_drive_minutes,
          bleacherNumber: r.bleacher_number,
          pickupLabel: r.pickup_street,
          dropoffLabel: r.dropoff_street,
        },
      ];
    });
    return layoutSchedule(trackers, weekStart);
  }, [data, weekStart]);

  const name = names?.[0];
  const driverName = name ? [name.first_name, name.last_name].filter(Boolean).join(" ") : null;
  return { days, driverName: driverName || null, isLoading };
}
