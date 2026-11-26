"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { driverProofsQuery, type DriverProofRow } from "../db/weekProofsQuery";
import { buildDriverProofs, type DriverProofs } from "../logic/proofList";

/**
 * Each zone driver's trips per day of the week beginning `weekStart`, counted by GPS proof status
 * as of today (on this device), from the local database. No zone: no drivers.
 */
export function useDriverProofs(
  zoneId: string,
  weekStart: string,
): { drivers: DriverProofs[]; isLoading: boolean } {
  const weekEnd = weekEndOf(weekStart);
  const compiled = useMemo(
    () => driverProofsQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<DriverProofRow>());

  const drivers = useMemo(() => {
    const trips = (data ?? []).flatMap((r) => {
      const date = timestampToDate(r.date);
      if (!r.driver_uuid || !date) return [];
      return [
        {
          driverUuid: r.driver_uuid,
          driverName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed driver",
          date,
          trackerStatus: r.tracker_status,
          proofStatus: r.proof_status,
        },
      ];
    });
    return buildDriverProofs(trips, weekStart, DateTime.now().toISODate()!);
  }, [data, weekStart]);

  return { drivers, isLoading };
}
