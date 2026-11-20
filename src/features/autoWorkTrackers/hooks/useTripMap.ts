"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { workTrackerMapQuery } from "@/features/scheduleValidator/db/bleacherMoveQueries";
import { timestampToDate } from "../utils/discoverTrips";
import { weekEndOf } from "../utils/week";
import {
  buildDriverLoops,
  type DriverLoops,
  type MapPoint,
  type MapTracker,
} from "../utils/tripMap";

type Row = {
  id: string;
  date: string | null;
  driver_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  bleacher_number: number | null;
  home_lat: number | null;
  home_lng: number | null;
  home_street: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_street: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_street: string | null;
};

const point = (lat: number | null, lng: number | null, label: string | null): MapPoint | null =>
  lat != null && lng != null ? { lat, lng, label: label ?? "" } : null;

/** Each driver's loops for the zone's work trackers dated in the week (see buildDriverLoops). */
export function useTripMap(
  zoneId: string,
  weekStart: string,
): { loops: DriverLoops[]; trackers: number; isLoading: boolean } {
  const weekEnd = weekEndOf(weekStart);
  const compiled = useMemo(
    () => workTrackerMapQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const loops = useMemo(() => {
    const trackers: MapTracker[] = (data ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!date) return [];
      return [
        {
          workTrackerUuid: r.id,
          date,
          driverUuid: r.driver_uuid,
          driverName: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
          bleacherNumber: r.bleacher_number,
          home: point(r.home_lat, r.home_lng, r.home_street),
          pickup: point(r.pickup_lat, r.pickup_lng, r.pickup_street),
          dropoff: point(r.dropoff_lat, r.dropoff_lng, r.dropoff_street),
        },
      ];
    });
    return buildDriverLoops(
      trackers,
      (t) => `#${t.bleacherNumber ?? "?"} · ${DateTime.fromISO(t.date).toFormat("EEE, MMM d")}`,
    );
  }, [data]);

  return { loops: zoneId ? loops : [], trackers: zoneId ? (data ?? []).length : 0, isLoading };
}
