"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { checkDriverAvailability, type DriverTripCheck } from "../utils/driverAvailability";

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
type UnavailabilityRow = { driver_uuid: string | null; date_unavailable: string | null };

/**
 * The work trackers dated in the week beginning `weekStart` that have a driver, each with whether
 * that driver is free that day, from the local database. A work tracker with no driver has no one
 * to check, so it is left out.
 */
export function useDriverAvailability(weekStart: string): {
  trips: DriverTripCheck[];
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
        .select(["du.driver_uuid as driver_uuid", "du.date_unavailable as date_unavailable"])
        .where("du.date_unavailable", ">=", weekStart)
        .where("du.date_unavailable", "<=", weekEnd)
        .compile(),
    [weekStart, weekEnd],
  );
  const { data: unavailabilityRows, isLoading: unavailabilityLoading } = useTypedQuery(
    compiledUnavailability,
    expect<UnavailabilityRow>(),
  );

  const trips = useMemo(() => {
    const unavailability = (unavailabilityRows ?? []).flatMap((r) => {
      const date = timestampToDate(r.date_unavailable);
      return r.driver_uuid && date ? [{ driverUuid: r.driver_uuid, date }] : [];
    });
    const driverTrips = (tripRows ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!r.driver_uuid || !date) return [];
      return [
        {
          workTrackerId: r.id,
          date,
          driverUuid: r.driver_uuid,
          driverName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed driver",
          fromStreet: r.pickup_street,
          toStreet: r.dropoff_street,
        },
      ];
    });
    return checkDriverAvailability(driverTrips, unavailability);
  }, [tripRows, unavailabilityRows]);

  return { trips, isLoading: tripsLoading || unavailabilityLoading };
}
