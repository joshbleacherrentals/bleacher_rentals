import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import {
  driverDataQuery,
  driverUnavailabilityQuery,
  driverWorkloadQuery,
} from "@/features/scheduleValidator/db/driverQueries";
import { addressesQuery } from "@/features/scheduleValidator/db/bleacherMoveQueries";
import { db } from "@/components/providers/SystemProvider";
import { loadTripsNeeded } from "../db/tripsNeeded";
import { timestampToDate } from "../utils/discoverTrips";
import { weekEndOf } from "../utils/week";
import type { PlanDriver, PlanTrip } from "./buildSolve";
import type { ExistingTracker } from "./duplicates";
import type { Point } from "./roadTimes";

export type PlanningInputs = {
  trips: PlanTrip[];
  drivers: PlanDriver[];
  /** "driverUuid|YYYY-MM-DD": marked unavailable, or already on a work tracker that day. */
  blocked: Set<string>;
  existing: ExistingTracker[];
  /** The "Trip" work tracker type (code `trip`, as the modal picks it); null if missing. */
  tripTypeUuid: string | null;
};

const point = (lat: number | null, lng: number | null): Point | null =>
  lat != null && lng != null ? [lat, lng] : null;

/**
 * Everything the planner needs for a zone and week, read once from the local database with the
 * same queries the check pages use (Driver Data, Driver Availability, Driver Workload, Bleacher
 * Data), so the planner plans from exactly what those pages show.
 */
export async function loadPlanningInputs(
  zoneId: string,
  weekStart: string,
): Promise<PlanningInputs> {
  const weekEnd = weekEndOf(weekStart);
  const [{ trips, trackers }, driverRows, unavailable, working, tripTypes] = await Promise.all([
    loadTripsNeeded(zoneId, weekStart),
    typedGetAll(
      driverDataQuery(zoneId),
      expect<{
        driver_uuid: string;
        first_name: string | null;
        last_name: string | null;
        address_uuid: string | null;
        exclude_from_auto_work_trackers: number | null;
        vendor_uuid: string | null;
        street: string | null;
        city: string | null;
        state_province: string | null;
        zip_postal: string | null;
        country: string | null;
        latitude: number | null;
        longitude: number | null;
        place_id: string | null;
      }>(),
    ),
    typedGetAll(
      driverUnavailabilityQuery(zoneId, weekStart, weekEnd),
      expect<{
        driver_uuid: string | null;
        date_unavailable: string | null;
        first_name: string | null;
        last_name: string | null;
      }>(),
    ),
    typedGetAll(
      driverWorkloadQuery(zoneId, weekStart, weekEnd),
      expect<{
        driver_uuid: string | null;
        date: string | null;
        drive_minutes: number | null;
        deadhead_in_drive_minutes: number | null;
        return_home_drive_minutes: number | null;
        distance_meters: number | null;
        deadhead_in_distance_meters: number | null;
        return_home_distance_meters: number | null;
        first_name: string | null;
        last_name: string | null;
      }>(),
    ),
    typedGetAll(
      db
        .selectFrom("WorkTrackerTypes")
        .select("id")
        .where("code", "=", "trip")
        .where("is_deleted", "=", 0)
        .orderBy("sort_order", "asc")
        .limit(1)
        .compile(),
      expect<{ id: string }>(),
    ),
  ]);

  const addressIds = [
    ...new Set(trips.flatMap((t) => [t.fromAddressUuid, t.toAddressUuid]).filter(Boolean)),
  ] as string[];
  const addressRows = await typedGetAll(
    addressesQuery(addressIds),
    expect<{
      id: string;
      street: string | null;
      city: string | null;
      state_province: string | null;
      zip_postal: string | null;
      country: string | null;
      latitude: number | null;
      longitude: number | null;
      place_id: string | null;
    }>(),
  );
  const coords = new Map(addressRows.map((a) => [a.id, point(a.latitude, a.longitude)]));

  const blocked = new Set<string>();
  for (const r of unavailable) {
    const day = timestampToDate(r.date_unavailable);
    if (r.driver_uuid && day) blocked.add(`${r.driver_uuid}|${day}`);
  }
  for (const r of working) {
    const day = timestampToDate(r.date);
    if (r.driver_uuid && day) blocked.add(`${r.driver_uuid}|${day}`);
  }

  return {
    trips: trips.map((t) => ({
      ...t,
      pickup: (t.fromAddressUuid && coords.get(t.fromAddressUuid)) || null,
      dropoff: (t.toAddressUuid && coords.get(t.toAddressUuid)) || null,
    })),
    drivers: driverRows
      .filter((d) => d.exclude_from_auto_work_trackers !== 1)
      .map((d) => ({
        driverUuid: d.driver_uuid,
        home: point(d.latitude, d.longitude),
        contractor: d.vendor_uuid != null,
      })),
    blocked,
    tripTypeUuid: tripTypes[0]?.id ?? null,
    existing: trackers.flatMap((t) =>
      t.bleacher_uuid
        ? [
            {
              bleacherUuid: t.bleacher_uuid,
              date: timestampToDate(t.date),
              dropoffAddressUuid: t.dropoff_address_uuid,
              dropoffStreet: t.dropoff_street,
              dropoffLatitude: t.dropoff_latitude,
              dropoffLongitude: t.dropoff_longitude,
            },
          ]
        : [],
    ),
  };
}
