import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import {
  discoverTrips,
  timestampToDate,
  type BleacherInput,
  type BleacherStop,
  type ExistingTrip,
  type NeededTrip,
} from "../utils/discoverTrips";

/** Work trackers that are off: nobody is going to make the trip, so they do not count as covering it. */
export const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

export type BleacherRow = { id: string; bleacher_number: number | null };

export type EventRow = {
  bleacher_uuid: string | null;
  event_uuid: string;
  event_name: string | null;
  setup_start: string | null;
  event_start: string | null;
  event_end: string | null;
  teardown_end: string | null;
  street: string | null;
  address_uuid: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type WorkTrackerRow = {
  id: string;
  bleacher_uuid: string | null;
  date: string | null;
  pickup_street: string | null;
  dropoff_street: string | null;
  pickup_address_uuid: string | null;
  dropoff_address_uuid: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
};

/** The zone's bleachers. */
export function zoneBleachersQuery(zoneId: string) {
  return db
    .selectFrom("Bleachers as b")
    .select(["b.id as id", "b.bleacher_number as bleacher_number"])
    .where("b.zone_uuid", "=", zoneId)
    .where("b.deleted", "=", 0)
    .compile();
}

/**
 * Each booked event the zone's bleachers are on, with its place: its own address, or its venue's
 * when it has no street of its own (the address row and coordinates come from the same one).
 */
export function zoneBleacherEventsQuery(zoneId: string) {
  return db
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
      sql<string | null>`case when a.street is not null then a.id else va.id end`.as(
        "address_uuid",
      ),
      sql<number | null>`case when a.street is not null then a.latitude else va.latitude end`.as(
        "latitude",
      ),
      sql<number | null>`case when a.street is not null then a.longitude else va.longitude end`.as(
        "longitude",
      ),
    ])
    .where("b.zone_uuid", "=", zoneId)
    .where("b.deleted", "=", 0)
    .where("e.event_status", "=", "booked")
    .where("e.deleted", "=", 0)
    .compile();
}

/** The zone's bleachers' work trackers, unless off, with both places. */
export function zoneBleacherTrackersQuery(zoneId: string) {
  return db
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
      "w.pickup_address_uuid as pickup_address_uuid",
      "w.dropoff_address_uuid as dropoff_address_uuid",
      "pa.latitude as pickup_latitude",
      "pa.longitude as pickup_longitude",
      "da.latitude as dropoff_latitude",
      "da.longitude as dropoff_longitude",
    ])
    .where("b.zone_uuid", "=", zoneId)
    .where("b.deleted", "=", 0)
    .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
    .compile();
}

/** The bleachers as discoverTrips needs them: their events (stops) and work trackers. Pure. */
export function buildBleacherInputs(
  bleachers: BleacherRow[],
  events: EventRow[],
  trackers: WorkTrackerRow[],
): BleacherInput[] {
  const stopsByBleacher = new Map<string, BleacherStop[]>();
  for (const row of events) {
    const startDate = timestampToDate(row.setup_start ?? row.event_start);
    const endDate = timestampToDate(row.teardown_end ?? row.event_end);
    if (!row.bleacher_uuid || !startDate || !endDate) continue;
    const stops = stopsByBleacher.get(row.bleacher_uuid) ?? [];
    stops.push({
      eventUuid: row.event_uuid,
      eventName: row.event_name,
      street: row.street,
      addressUuid: row.address_uuid,
      latitude: row.latitude,
      longitude: row.longitude,
      startDate,
      endDate,
    });
    stopsByBleacher.set(row.bleacher_uuid, stops);
  }

  const tripsByBleacher = new Map<string, ExistingTrip[]>();
  for (const row of trackers) {
    if (!row.bleacher_uuid) continue;
    const existing = tripsByBleacher.get(row.bleacher_uuid) ?? [];
    existing.push({
      workTrackerUuid: row.id,
      date: timestampToDate(row.date),
      pickupStreet: row.pickup_street,
      dropoffStreet: row.dropoff_street,
      pickupAddressUuid: row.pickup_address_uuid,
      dropoffAddressUuid: row.dropoff_address_uuid,
      pickupLatitude: row.pickup_latitude,
      pickupLongitude: row.pickup_longitude,
      dropoffLatitude: row.dropoff_latitude,
      dropoffLongitude: row.dropoff_longitude,
    });
    tripsByBleacher.set(row.bleacher_uuid, existing);
  }

  return bleachers.map((b) => ({
    bleacherUuid: b.id,
    bleacherNumber: b.bleacher_number,
    stops: stopsByBleacher.get(b.id) ?? [],
    trips: tripsByBleacher.get(b.id) ?? [],
  }));
}

/**
 * The trips the zone needs in the week, read once from the local database (the planner's input),
 * and the zone's work trackers they were worked out from (for the re-run check).
 */
export async function loadTripsNeeded(
  zoneId: string,
  weekStart: string,
): Promise<{ trips: NeededTrip[]; trackers: WorkTrackerRow[] }> {
  const [bleachers, events, trackers] = await Promise.all([
    typedGetAll(zoneBleachersQuery(zoneId), expect<BleacherRow>()),
    typedGetAll(zoneBleacherEventsQuery(zoneId), expect<EventRow>()),
    typedGetAll(zoneBleacherTrackersQuery(zoneId), expect<WorkTrackerRow>()),
  ]);
  return {
    trips: discoverTrips(buildBleacherInputs(bleachers, events, trackers), weekStart),
    trackers,
  };
}
