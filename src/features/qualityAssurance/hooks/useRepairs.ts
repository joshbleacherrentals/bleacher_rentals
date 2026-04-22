"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type RepairListRow = {
  maintenanceEventUuid: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  costCents: number | null;
  notes: string | null;
  createdAt: string | null;
  bleachers: { uuid: string; bleacherNumber: number | null }[];
};

type RawRepairRow = {
  maintenanceEventUuid: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  costCents: number | null;
  notes: string | null;
  createdAt: string | null;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
};

/**
 * Reactive list of MaintenanceEvents with all bleachers attached via the
 * BleacherMaintEvents junction. Optionally filter by bleacher uuid.
 *
 * The query left-joins the junction so an event with no bleachers still shows
 * up. Each (event, bleacher) combination yields one raw row, which we group
 * back into a single event record client-side. When a bleacher filter is
 * applied we still display all sibling bleachers attached to the matched
 * event by re-querying the full set of bleachers for the matching event ids.
 */
export function useRepairs(filters: { bleacherUuid?: string | null }): RepairListRow[] {
  const { bleacherUuid } = filters;

  // Step 1: get the event ids that match the filter (if any).
  const matchingEventsCompiled = useMemo(() => {
    if (!bleacherUuid) {
      return db.selectFrom("MaintenanceEvents as me").select(["me.id as eventId"]).compile();
    }
    return db
      .selectFrom("BleacherMaintEvents as bme")
      .select(["bme.maintenance_event_uuid as eventId"])
      .where("bme.bleacher_uuid", "=", bleacherUuid)
      .compile();
  }, [bleacherUuid]);

  const { data: matchingIdRows = [] } = useTypedQuery(
    matchingEventsCompiled,
    expect<{ eventId: string | null }>(),
  );

  const matchingEventIds = useMemo(
    () => Array.from(new Set(matchingIdRows.map((r) => r.eventId).filter((v): v is string => !!v))),
    [matchingIdRows],
  );

  // Step 2: pull events + all attached bleachers for those ids.
  const detailCompiled = useMemo(() => {
    let q = db
      .selectFrom("MaintenanceEvents as me")
      .leftJoin("BleacherMaintEvents as bme", "bme.maintenance_event_uuid", "me.id")
      .leftJoin("Bleachers as b", "b.id", "bme.bleacher_uuid")
      .select([
        "me.id as maintenanceEventUuid",
        "me.event_name as eventName",
        "me.event_start as eventStart",
        "me.event_end as eventEnd",
        "me.cost_cents as costCents",
        "me.notes as notes",
        "me.created_at as createdAt",
        "b.id as bleacherUuid",
        "b.bleacher_number as bleacherNumber",
      ]);

    if (bleacherUuid) {
      if (matchingEventIds.length === 0) {
        // Force empty result while preserving query shape
        q = q.where("me.id", "=", "__no_match__");
      } else {
        q = q.where("me.id", "in", matchingEventIds);
      }
    }

    return q.orderBy("me.event_start", "desc").compile();
  }, [bleacherUuid, matchingEventIds]);

  const { data = [] } = useTypedQuery(detailCompiled, expect<RawRepairRow>());

  return useMemo(() => {
    const byEvent = new Map<string, RepairListRow>();
    for (const r of data) {
      let entry = byEvent.get(r.maintenanceEventUuid);
      if (!entry) {
        entry = {
          maintenanceEventUuid: r.maintenanceEventUuid,
          eventName: r.eventName,
          eventStart: r.eventStart,
          eventEnd: r.eventEnd,
          costCents: r.costCents,
          notes: r.notes,
          createdAt: r.createdAt,
          bleachers: [],
        };
        byEvent.set(r.maintenanceEventUuid, entry);
      }
      if (r.bleacherUuid) {
        entry.bleachers.push({ uuid: r.bleacherUuid, bleacherNumber: r.bleacherNumber });
      }
    }
    const rows = Array.from(byEvent.values());
    rows.sort((a, b) => (b.eventStart ?? "").localeCompare(a.eventStart ?? ""));
    return rows;
  }, [data]);
}
