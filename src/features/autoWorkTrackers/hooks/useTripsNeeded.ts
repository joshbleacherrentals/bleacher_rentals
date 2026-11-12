"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  discoverTrips,
  timestampToDate,
  type BleacherInput,
  type BleacherStop,
  type ExistingTrip,
  type NeededTrip,
} from "../utils/discoverTrips";

type BleacherRow = { id: string; bleacher_number: number | null };

type EventRow = {
  bleacher_uuid: string | null;
  event_uuid: string;
  event_name: string | null;
  setup_start: string | null;
  event_start: string | null;
  event_end: string | null;
  teardown_end: string | null;
  street: string | null;
};

type WorkTrackerRow = {
  id: string;
  bleacher_uuid: string | null;
  date: string | null;
  pickup_street: string | null;
  dropoff_street: string | null;
};

/** Work trackers that are off: nobody is going to make the trip, so they do not count as covering it. */
const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

/**
 * The trips needed for the zone's bleachers in the week starting `weekStart`, worked out from
 * local data only (nothing is stored). `trips` is empty until a zone is chosen.
 */
export function useTripsNeeded(
  zoneId: string,
  weekStart: string,
): { trips: NeededTrip[]; isLoading: boolean } {
  const compiledBleachers = useMemo(
    () =>
      db
        .selectFrom("Bleachers as b")
        .select(["b.id as id", "b.bleacher_number as bleacher_number"])
        .where("b.zone_uuid", "=", zoneId)
        .where("b.deleted", "=", 0)
        .compile(),
    [zoneId],
  );
  const { data: bleachers, isLoading: bleachersLoading } = useTypedQuery(
    compiledBleachers,
    expect<BleacherRow>(),
  );

  // An event's place is its own address, or its venue's when it has none of its own.
  const compiledEvents = useMemo(
    () =>
      db
        .selectFrom("Bleachers as b")
        .innerJoin("BleacherEvents as be", "be.bleacher_uuid", "b.id")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .leftJoin("Addresses as a", "a.id", "e.address_uuid")
        .leftJoin("Venues as v", "v.id", "e.venue_uuid")
        .leftJoin("Addresses as va", "va.id", "v.address_uuid")
        .select([
          "be.bleacher_uuid as bleacher_uuid",
          "e.id as event_uuid",
          "e.event_name as event_name",
          "e.setup_start as setup_start",
          "e.event_start as event_start",
          "e.event_end as event_end",
          "e.teardown_end as teardown_end",
          sql<string | null>`coalesce(a.street, va.street)`.as("street"),
        ])
        .where("b.zone_uuid", "=", zoneId)
        .where("b.deleted", "=", 0)
        .where("e.event_status", "=", "booked")
        .where("e.deleted", "=", 0)
        .compile(),
    [zoneId],
  );
  const { data: events, isLoading: eventsLoading } = useTypedQuery(
    compiledEvents,
    expect<EventRow>(),
  );

  const compiledWorkTrackers = useMemo(
    () =>
      db
        .selectFrom("Bleachers as b")
        .innerJoin("WorkTrackers as w", "w.bleacher_uuid", "b.id")
        .leftJoin("Addresses as pa", "pa.id", "w.pickup_address_uuid")
        .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
        .select([
          "w.id as id",
          "w.bleacher_uuid as bleacher_uuid",
          "w.date as date",
          "pa.street as pickup_street",
          "da.street as dropoff_street",
        ])
        .where("b.zone_uuid", "=", zoneId)
        .where("b.deleted", "=", 0)
        .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
        .compile(),
    [zoneId],
  );
  const { data: workTrackers, isLoading: workTrackersLoading } = useTypedQuery(
    compiledWorkTrackers,
    expect<WorkTrackerRow>(),
  );

  const trips = useMemo(() => {
    if (!zoneId) return [];

    const stopsByBleacher = new Map<string, BleacherStop[]>();
    for (const row of events ?? []) {
      const startDate = timestampToDate(row.setup_start ?? row.event_start);
      const endDate = timestampToDate(row.teardown_end ?? row.event_end);
      if (!row.bleacher_uuid || !startDate || !endDate) continue;
      const stops = stopsByBleacher.get(row.bleacher_uuid) ?? [];
      stops.push({
        eventUuid: row.event_uuid,
        eventName: row.event_name,
        street: row.street,
        startDate,
        endDate,
      });
      stopsByBleacher.set(row.bleacher_uuid, stops);
    }

    const tripsByBleacher = new Map<string, ExistingTrip[]>();
    for (const row of workTrackers ?? []) {
      if (!row.bleacher_uuid) continue;
      const existing = tripsByBleacher.get(row.bleacher_uuid) ?? [];
      existing.push({
        workTrackerUuid: row.id,
        date: timestampToDate(row.date),
        pickupStreet: row.pickup_street,
        dropoffStreet: row.dropoff_street,
      });
      tripsByBleacher.set(row.bleacher_uuid, existing);
    }

    const inputs: BleacherInput[] = (bleachers ?? []).map((b) => ({
      bleacherUuid: b.id,
      bleacherNumber: b.bleacher_number,
      stops: stopsByBleacher.get(b.id) ?? [],
      trips: tripsByBleacher.get(b.id) ?? [],
    }));

    return discoverTrips(inputs, weekStart);
  }, [zoneId, weekStart, bleachers, events, workTrackers]);

  return { trips, isLoading: bleachersLoading || eventsLoading || workTrackersLoading };
}
