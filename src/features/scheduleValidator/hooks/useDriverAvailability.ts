"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { buildDriverAvailability, type DriverAvailability } from "../utils/driverAvailability";

/** Work trackers that are off: nobody is making the trip, so the driver's availability is moot. */
const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

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
 * For the week beginning `weekStart`, each driver with a work tracker or an unavailable day: per day,
 * whether they marked it unavailable and the trips they are on, from the local database. A work
 * tracker with no driver has no one to check, so it is left out.
 */
export function useDriverAvailability(weekStart: string): {
  drivers: DriverAvailability[];
  isLoading: boolean;
} {
  const weekEnd = weekEndOf(weekStart);

  const compiledTrips = useMemo(
    () =>
      db
        .selectFrom("WorkTrackers as w")
        .innerJoin("Drivers as d", "d.id", "w.driver_uuid")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .leftJoin("Addresses as pa", "pa.id", "w.pickup_address_uuid")
        .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
        .select([
          "w.id as id",
          "w.date as date",
          "w.driver_uuid as driver_uuid",
          "u.first_name as first_name",
          "u.last_name as last_name",
          "pa.street as pickup_street",
          "da.street as dropoff_street",
        ])
        .where("w.date", ">=", weekStart)
        .where("w.date", "<=", weekEnd)
        .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
        .compile(),
    [weekStart, weekEnd],
  );
  const { data: tripRows, isLoading: tripsLoading } = useTypedQuery(
    compiledTrips,
    expect<TripRow>(),
  );

  const compiledUnavailability = useMemo(
    () =>
      db
        .selectFrom("DriverUnavailability as du")
        .innerJoin("Drivers as d", "d.id", "du.driver_uuid")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .select([
          "du.driver_uuid as driver_uuid",
          "du.date_unavailable as date_unavailable",
          "u.first_name as first_name",
          "u.last_name as last_name",
        ])
        .where("du.date_unavailable", ">=", weekStart)
        .where("du.date_unavailable", "<=", weekEnd)
        .compile(),
    [weekStart, weekEnd],
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
