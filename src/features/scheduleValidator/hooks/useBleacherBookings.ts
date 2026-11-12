"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import type { BleacherBooking } from "../utils/overbooked";

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
 * Every bleacher selected on a booked event that runs into the week beginning `weekStart`: the
 * bleacher events table links a bleacher to an event, and the event gives the dates. The query
 * narrows by date text with a day to spare; the exact days, in the viewer's own time, are decided
 * here and in `findOverbookedBleachers`.
 */
export function useBleacherBookings(weekStart: string): {
  bookings: BleacherBooking[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    const from = DateTime.fromISO(weekStart, { zone: "utc" }).minus({ days: 1 }).toISODate()!;
    const to = DateTime.fromISO(weekEndOf(weekStart), { zone: "utc" })
      .plus({ days: 2 })
      .toISODate()!;
    return db
      .selectFrom("BleacherEvents as be")
      .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
      .innerJoin("Events as e", "e.id", "be.event_uuid")
      .leftJoin("BleacherTypes as bt", "bt.id", "b.bleacher_type_uuid")
      .select([
        "be.bleacher_uuid as bleacher_uuid",
        "b.bleacher_number as bleacher_number",
        "bt.name as bleacher_type_name",
        "be.event_uuid as event_uuid",
        "e.event_name as event_name",
        "e.event_start as event_start",
        "e.event_end as event_end",
      ])
      .where("b.deleted", "=", 0)
      .where("e.deleted", "=", 0)
      .where("e.event_status", "=", "booked")
      .where("e.event_end", ">=", from)
      .where("e.event_start", "<", to)
      .compile();
  }, [weekStart]);
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
