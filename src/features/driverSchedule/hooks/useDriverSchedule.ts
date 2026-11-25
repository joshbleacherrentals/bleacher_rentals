"use client";

import { useMemo } from "react";
import { useAutoWorkTrackerSettings } from "@/features/autoWorkTrackers/hooks/useAutoWorkTrackerSettings";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { driverNameQuery, driverScheduleQuery } from "../db/driverScheduleQuery";
import {
  layoutSchedule,
  scheduleDayOf,
  type ScheduleDay,
  type ScheduleTracker,
} from "../utils/scheduleLayout";
import {
  buildDriverLoops,
  type DriverLoops,
  type MapPoint,
  type MapTracker,
} from "@/features/autoWorkTrackers/utils/tripMap";

type Row = {
  id: string;
  date: string | null;
  previous_work_tracker_uuid: string | null;
  planned_pickup_at: string | null;
  planned_dropoff_at: string | null;
  drive_minutes: number | null;
  deadhead_in_drive_minutes: number | null;
  return_home_drive_minutes: number | null;
  setup_required: number | null;
  teardown_required: number | null;
  bleacher_number: number | null;
  pickup_street: string | null;
  dropoff_street: string | null;
  driver_uuid: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_street: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
};

const point = (lat: number | null, lng: number | null, label: string | null): MapPoint | null =>
  lat != null && lng != null ? { lat, lng, label: label ?? "" } : null;

/**
 * A driver's week laid out for the schedule grid (layoutSchedule), and each day's route for the map
 * (buildDriverLoops, one driver), from the local database.
 */
export function useDriverSchedule(
  userUuid: string,
  weekStart: string,
): {
  days: ScheduleDay[];
  routesByDay: Map<string, DriverLoops[]>;
  driverName: string | null;
  isLoading: boolean;
} {
  const weekEnd = weekEndOf(weekStart);
  const compiled = useMemo(
    () => driverScheduleQuery(userUuid, weekStart, weekEnd),
    [userUuid, weekStart, weekEnd],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());
  // Setup and teardown times as the Auto Work Trackers settings have them (defaults when not synced).
  const { settings } = useAutoWorkTrackerSettings();

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
          teardownMinutes: r.teardown_required ? settings.teardownMinutes : 0,
          setupMinutes: r.setup_required ? settings.setupMinutes : 0,
          bleacherNumber: r.bleacher_number,
          pickupLabel: r.pickup_street,
          dropoffLabel: r.dropoff_street,
        },
      ];
    });
    return layoutSchedule(trackers, weekStart);
  }, [data, weekStart, settings.setupMinutes, settings.teardownMinutes]);

  const routesByDay = useMemo(() => {
    const byDay = new Map<string, MapTracker[]>();
    for (const r of data ?? []) {
      const date = timestampToDate(r.date);
      if (!date) continue;
      const day = scheduleDayOf({ date, plannedPickupAt: r.planned_pickup_at });
      const tracker: MapTracker = {
        workTrackerUuid: r.id,
        date: day,
        driverUuid: r.driver_uuid,
        previousUuid: r.previous_work_tracker_uuid,
        driverName: null,
        bleacherNumber: r.bleacher_number,
        home: point(r.home_lat, r.home_lng, r.home_street),
        pickup: point(r.pickup_lat, r.pickup_lng, r.pickup_street),
        dropoff: point(r.dropoff_lat, r.dropoff_lng, r.dropoff_street),
      };
      byDay.set(day, [...(byDay.get(day) ?? []), tracker]);
    }
    return new Map(
      [...byDay].map(([day, trackers]) => [
        day,
        buildDriverLoops(trackers, (t) => `#${t.bleacherNumber ?? "?"}`),
      ]),
    );
  }, [data]);

  const name = names?.[0];
  const driverName = name ? [name.first_name, name.last_name].filter(Boolean).join(" ") : null;
  return { days, routesByDay, driverName: driverName || null, isLoading };
}
