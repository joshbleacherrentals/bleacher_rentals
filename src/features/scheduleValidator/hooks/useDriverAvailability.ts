"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { buildDriverAvailability, type DriverAvailability } from "../utils/driverAvailability";
import { driverAvailabilityTripsQuery, driverUnavailabilityQuery } from "../db/driverQueries";

type TripRow = {
  id: string;
  date: string | null;
  driver_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  pickup_street: string | null;
  dropoff_street: string | null;
};
type UnavailabilityRow = {
  driver_uuid: string | null;
  date_unavailable: string | null;
  first_name: string | null;
  last_name: string | null;
};

const fullName = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ") || "Unnamed driver";

/**
 * For the week beginning `weekStart`, each driver in the zone with a work tracker or an unavailable
 * day (no zone: no drivers): per day,
 * whether they marked it unavailable and the trips they are on, from the local database. A work
 * tracker with no driver has no one to check, so it is left out.
 */
export function useDriverAvailability(
  zoneId: string,
  weekStart: string,
): {
  drivers: DriverAvailability[];
  isLoading: boolean;
} {
  const weekEnd = weekEndOf(weekStart);

  const compiledTrips = useMemo(
    () => driverAvailabilityTripsQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const { data: tripRows, isLoading: tripsLoading } = useTypedQuery(
    compiledTrips,
    expect<TripRow>(),
  );

  const compiledUnavailability = useMemo(
    () => driverUnavailabilityQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const { data: unavailabilityRows, isLoading: unavailabilityLoading } = useTypedQuery(
    compiledUnavailability,
    expect<UnavailabilityRow>(),
  );

  const drivers = useMemo(() => {
    const unavailability = (unavailabilityRows ?? []).flatMap((r) => {
      const date = timestampToDate(r.date_unavailable);
      if (!r.driver_uuid || !date) return [];
      return [{ driverUuid: r.driver_uuid, driverName: fullName(r.first_name, r.last_name), date }];
    });
    const driverTrips = (tripRows ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!r.driver_uuid || !date) return [];
      return [
        {
          workTrackerId: r.id,
          date,
          driverUuid: r.driver_uuid,
          driverName: fullName(r.first_name, r.last_name),
          fromStreet: r.pickup_street,
          toStreet: r.dropoff_street,
        },
      ];
    });
    return buildDriverAvailability(driverTrips, unavailability, weekStart);
  }, [tripRows, unavailabilityRows, weekStart]);

  return { drivers, isLoading: tripsLoading || unavailabilityLoading };
}
