"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { discoverTrips, type NeededTrip } from "../utils/discoverTrips";
import {
  buildBleacherInputs,
  zoneBleacherEventsQuery,
  zoneBleachersQuery,
  zoneBleacherTrackersQuery,
  type BleacherRow,
  type EventRow,
  type WorkTrackerRow,
} from "../db/tripsNeeded";

/**
 * The trips needed for the zone's bleachers in the week starting `weekStart`, live from the local
 * database: the same queries and rules the planner uses (db/tripsNeeded.ts), so a check page and
 * the planner always agree. `trips` is empty until a zone is chosen.
 */
export function useTripsNeeded(
  zoneId: string,
  weekStart: string,
): { trips: NeededTrip[]; isLoading: boolean } {
  const bleachersQ = useMemo(() => zoneBleachersQuery(zoneId), [zoneId]);
  const eventsQ = useMemo(() => zoneBleacherEventsQuery(zoneId), [zoneId]);
  const trackersQ = useMemo(() => zoneBleacherTrackersQuery(zoneId), [zoneId]);
  const bleachers = useTypedQuery(bleachersQ, expect<BleacherRow>());
  const events = useTypedQuery(eventsQ, expect<EventRow>());
  const trackers = useTypedQuery(trackersQ, expect<WorkTrackerRow>());

  const trips = useMemo(() => {
    if (!zoneId) return [];
    return discoverTrips(
      buildBleacherInputs(bleachers.data ?? [], events.data ?? [], trackers.data ?? []),
      weekStart,
    );
  }, [zoneId, weekStart, bleachers.data, events.data, trackers.data]);

  return { trips, isLoading: bleachers.isLoading || events.isLoading || trackers.isLoading };
}
