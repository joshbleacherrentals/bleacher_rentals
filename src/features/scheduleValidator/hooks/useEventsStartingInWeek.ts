"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { eventsStartingInWeek, type WeekEvent } from "../utils/eventsStartingInWeek";

type Row = { id: string; event_name: string | null; event_start: string | null };

/**
 * The booked events that start in the week beginning `weekStart`, read from the local database.
 * The query only narrows by date text with a day to spare on each side; the exact day, in the
 * viewer's own time, is decided by `eventsStartingInWeek`.
 */
export function useEventsStartingInWeek(weekStart: string): {
  events: WeekEvent[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    const from = DateTime.fromISO(weekStart, { zone: "utc" }).minus({ days: 1 }).toISODate()!;
    const to = DateTime.fromISO(weekEndOf(weekStart), { zone: "utc" })
      .plus({ days: 2 })
      .toISODate()!;
    return db
      .selectFrom("Events as e")
      .select(["e.id as id", "e.event_name as event_name", "e.event_start as event_start"])
      .where("e.event_status", "=", "booked")
      .where("e.deleted", "=", 0)
      .where("e.event_start", ">=", from)
      .where("e.event_start", "<", to)
      .compile();
  }, [weekStart]);
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const events = useMemo(
    () =>
      eventsStartingInWeek(
        (data ?? []).map((r) => ({ id: r.id, eventName: r.event_name, eventStart: r.event_start })),
        weekStart,
      ),
    [data, weekStart],
  );
  return { events, isLoading };
}
