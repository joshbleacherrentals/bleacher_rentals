"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { buildDriverData, type DriverData } from "../utils/driverData";
import { driverDataQuery } from "../db/driverQueries";

type Row = {
  driver_uuid: string;
  first_name: string | null;
  last_name: string | null;
  address_uuid: string | null;
  exclude_from_auto_work_trackers: number | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/**
 * Each active driver in the zone and whether they have the data the work tracker model needs, from
 * the local database. Does not depend on the week. No zone: no drivers.
 */
export function useDriverData(zoneId: string): { drivers: DriverData[]; isLoading: boolean } {
  const compiled = useMemo(() => driverDataQuery(zoneId), [zoneId]);
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const drivers = useMemo(
    () =>
      buildDriverData(
        (data ?? []).flatMap((r) => {
          if (!r.driver_uuid) return [];
          return [
            {
              driverUuid: r.driver_uuid,
              driverName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed driver",
              addressUuid: r.address_uuid,
              excluded: r.exclude_from_auto_work_trackers === 1,
              address: r.address_uuid
                ? {
                    street: r.street,
                    city: r.city,
                    state_province: r.state_province,
                    zip_postal: r.zip_postal,
                    country: r.country,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    place_id: r.place_id,
                  }
                : null,
            },
          ];
        }),
      ),
    [data],
  );

  return { drivers, isLoading };
}
