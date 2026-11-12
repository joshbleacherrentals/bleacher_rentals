"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { eventsStartingInWeek } from "../utils/eventsStartingInWeek";
import {
  checkLogisticsPlans,
  type EventLogisticsCheck,
  type HistoryItem,
  type PlannedEvent,
} from "../utils/logisticsPlan";

/** Work trackers that are off: nobody made the trip, so the bleacher did not move. */
const OFF_STATUSES = ["cancelled", "declined", "abandoned"];

type WeekEventRow = {
  id: string;
  event_name: string | null;
  event_start: string | null;
  street: string | null;
};
type AssignmentRow = {
  event_uuid: string | null;
  bleacher_uuid: string | null;
  bleacher_number: number | null;
  bleacher_type_name: string | null;
};
type PastEventRow = {
  bleacher_uuid: string | null;
  id: string;
  event_name: string | null;
  event_end: string | null;
  street: string | null;
};
type MaintenanceRow = {
  bleacher_uuid: string | null;
  id: string;
  event_name: string | null;
  event_end: string | null;
  street: string | null;
};
type WorkTrackerRow = {
  id: string;
  bleacher_uuid: string | null;
  actual_bleacher_uuid: string | null;
  date: string | null;
  street: string | null;
};

// An event is where its venue's address says it is, or at its own address when it has no venue
// address. The two are joined as `street` (own) and `venue_street`; the venue's wins.
const placeStreet = sql<string | null>`coalesce(va.street, a.street)`;

/**
 * The events that start in the week beginning `weekStart`, each with the bleachers assigned to it
 * and where every one of those bleachers was last, all from the local database. Nothing is stored.
 */
export function useLogisticsPlans(weekStart: string): {
  events: EventLogisticsCheck[];
  isLoading: boolean;
} {
  const compiledWeekEvents = useMemo(() => {
    const from = DateTime.fromISO(weekStart, { zone: "utc" }).minus({ days: 1 }).toISODate()!;
    const to = DateTime.fromISO(weekEndOf(weekStart), { zone: "utc" })
      .plus({ days: 2 })
      .toISODate()!;
    return db
      .selectFrom("Events as e")
      .leftJoin("Addresses as a", "a.id", "e.address_uuid")
      .leftJoin("Venues as v", "v.id", "e.venue_uuid")
      .leftJoin("Addresses as va", "va.id", "v.address_uuid")
      .select([
        "e.id as id",
        "e.event_name as event_name",
        "e.event_start as event_start",
        placeStreet.as("street"),
      ])
      .where("e.event_status", "=", "booked")
      .where("e.deleted", "=", 0)
      .where("e.event_start", ">=", from)
      .where("e.event_start", "<", to)
      .compile();
  }, [weekStart]);
  const { data: weekEventRows, isLoading: weekEventsLoading } = useTypedQuery(
    compiledWeekEvents,
    expect<WeekEventRow>(),
  );

  const weekEvents = useMemo(() => {
    const rows = weekEventRows ?? [];
    const inWeek = eventsStartingInWeek(
      rows.map((r) => ({ id: r.id, eventName: r.event_name, eventStart: r.event_start })),
      weekStart,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return inWeek.map((e) => ({
      eventId: e.id,
      eventName: e.name,
      startDate: timestampToDate(byId.get(e.id)!.event_start)!,
      street: byId.get(e.id)!.street,
    }));
  }, [weekEventRows, weekStart]);
  const weekEventIds = useMemo(() => weekEvents.map((e) => e.eventId), [weekEvents]);
  const weekEventIdsKey = weekEventIds.join(",");

  const compiledAssignments = useMemo(
    () =>
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .leftJoin("BleacherTypes as bt", "bt.id", "b.bleacher_type_uuid")
        .select([
          "be.event_uuid as event_uuid",
          "be.bleacher_uuid as bleacher_uuid",
          "b.bleacher_number as bleacher_number",
          "bt.name as bleacher_type_name",
        ])
        .where("be.event_uuid", "in", weekEventIds)
        .where("b.deleted", "=", 0)
        .compile(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekEventIdsKey],
  );
  const { data: assignments, isLoading: assignmentsLoading } = useTypedQuery(
    compiledAssignments,
    expect<AssignmentRow>(),
  );

  const bleacherIds = useMemo(
    () => [
      ...new Set(
        (assignments ?? []).map((a) => a.bleacher_uuid).filter((id): id is string => !!id),
      ),
    ],
    [assignments],
  );
  const bleacherIdsKey = bleacherIds.join(",");
  const weekEnd = weekEndOf(weekStart);

  // Everything these bleachers have done up to the end of the week. Which of it counts for a
  // given event (on or before its start) is decided in `lastKnownLocation`.
  const compiledPastEvents = useMemo(
    () =>
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .leftJoin("Addresses as a", "a.id", "e.address_uuid")
        .leftJoin("Venues as v", "v.id", "e.venue_uuid")
        .leftJoin("Addresses as va", "va.id", "v.address_uuid")
        .select([
          "be.bleacher_uuid as bleacher_uuid",
          "e.id as id",
          "e.event_name as event_name",
          "e.event_end as event_end",
          placeStreet.as("street"),
        ])
        .where("be.bleacher_uuid", "in", bleacherIds)
        .where("e.event_status", "=", "booked")
        .where("e.deleted", "=", 0)
        .compile(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bleacherIdsKey],
  );
  const { data: pastEvents, isLoading: pastEventsLoading } = useTypedQuery(
    compiledPastEvents,
    expect<PastEventRow>(),
  );

  const compiledMaintenance = useMemo(
    () =>
      db
        .selectFrom("BleacherMaintEvents as bm")
        .innerJoin("MaintenanceEvents as m", "m.id", "bm.maintenance_event_uuid")
        .leftJoin("Addresses as a", "a.id", "m.address_uuid")
        .select([
          "bm.bleacher_uuid as bleacher_uuid",
          "m.id as id",
          "m.event_name as event_name",
          "m.event_end as event_end",
          "a.street as street",
        ])
        .where("bm.bleacher_uuid", "in", bleacherIds)
        .where("m.deleted", "=", 0)
        .compile(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bleacherIdsKey],
  );
  const { data: maintenance, isLoading: maintenanceLoading } = useTypedQuery(
    compiledMaintenance,
    expect<MaintenanceRow>(),
  );

  // The bleacher that actually moved is the one swapped in, when the trip swapped one in.
  const compiledWorkTrackers = useMemo(
    () =>
      db
        .selectFrom("WorkTrackers as w")
        .leftJoin("Addresses as da", "da.id", "w.dropoff_address_uuid")
        .select([
          "w.id as id",
          "w.bleacher_uuid as bleacher_uuid",
          "w.actual_bleacher_uuid as actual_bleacher_uuid",
          "w.date as date",
          "da.street as street",
        ])
        .where((eb) =>
          eb.or([
            eb("w.bleacher_uuid", "in", bleacherIds),
            eb("w.actual_bleacher_uuid", "in", bleacherIds),
          ]),
        )
        .where((eb) => eb.or([eb("w.status", "is", null), eb("w.status", "not in", OFF_STATUSES)]))
        .where("w.date", "<=", weekEnd)
        .compile(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bleacherIdsKey, weekEnd],
  );
  const { data: workTrackers, isLoading: workTrackersLoading } = useTypedQuery(
    compiledWorkTrackers,
    expect<WorkTrackerRow>(),
  );

  const events = useMemo(() => {
    const history = new Map<string, HistoryItem[]>();
    const add = (bleacherId: string | null, item: HistoryItem | null) => {
      if (!bleacherId || !item) return;
      history.set(bleacherId, [...(history.get(bleacherId) ?? []), item]);
    };

    for (const r of pastEvents ?? []) {
      const date = timestampToDate(r.event_end);
      add(
        r.bleacher_uuid,
        date
          ? {
              kind: "event",
              id: r.id,
              date,
              street: r.street,
              label: r.event_name?.trim() || "Untitled event",
            }
          : null,
      );
    }
    for (const r of maintenance ?? []) {
      const date = timestampToDate(r.event_end);
      add(
        r.bleacher_uuid,
        date
          ? {
              kind: "maintenance",
              id: r.id,
              date,
              street: r.street,
              label: r.event_name?.trim() || "Maintenance",
            }
          : null,
      );
    }
    for (const r of workTrackers ?? []) {
      const date = timestampToDate(r.date);
      add(
        r.actual_bleacher_uuid ?? r.bleacher_uuid,
        date
          ? { kind: "work_tracker", id: r.id, date, street: r.street, label: "Work tracker" }
          : null,
      );
    }

    const bleachersByEvent = new Map<string, PlannedEvent["bleachers"]>();
    for (const a of assignments ?? []) {
      if (!a.event_uuid || !a.bleacher_uuid) continue;
      bleachersByEvent.set(a.event_uuid, [
        ...(bleachersByEvent.get(a.event_uuid) ?? []),
        {
          bleacherUuid: a.bleacher_uuid,
          bleacherNumber: a.bleacher_number,
          bleacherTypeName: a.bleacher_type_name,
          history: history.get(a.bleacher_uuid) ?? [],
        },
      ]);
    }

    return checkLogisticsPlans(
      weekEvents.map((e) => ({ ...e, bleachers: bleachersByEvent.get(e.eventId) ?? [] })),
    );
  }, [weekEvents, assignments, pastEvents, maintenance, workTrackers]);

  return {
    events,
    isLoading:
      weekEventsLoading ||
      assignmentsLoading ||
      pastEventsLoading ||
      maintenanceLoading ||
      workTrackersLoading,
  };
}
