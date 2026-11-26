"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import type { BleacherBooking } from "../utils/overbooked";
import { bleacherBookingsQuery } from "../db/bleacherBookingsQuery";

type Row = {
  bleacher_uuid: string | null;
  bleacher_number: number | null;
  bleacher_type_name: string | null;
  event_uuid: string | null;
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
};

/**
 * Every bleacher in the zone selected on a booked event that runs into the week beginning
 * `weekStart` (see `bleacherBookingsQuery`). No zone: no bookings.
 */
export function useBleacherBookings(
  zoneId: string,
  weekStart: string,
): {
  bookings: BleacherBooking[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => bleacherBookingsQuery(zoneId, weekStart), [zoneId, weekStart]);
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const bookings = useMemo(() => {
    const result: BleacherBooking[] = [];
    for (const r of data ?? []) {
      const startDate = timestampToDate(r.event_start);
      const endDate = timestampToDate(r.event_end);
      if (!r.bleacher_uuid || !r.event_uuid || !startDate || !endDate) continue;
      result.push({
        bleacherUuid: r.bleacher_uuid,
        bleacherNumber: r.bleacher_number,
        bleacherTypeName: r.bleacher_type_name,
        eventId: r.event_uuid,
        eventName: r.event_name?.trim() || "Untitled event",
        startDate,
        endDate,
      });
    }
    return result;
  }, [data]);

  return { bookings, isLoading };
}
