"use client";
import { useEffect, useMemo, useRef } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useAlertCountsStore } from "../../../state/useAlertCountsStore";
import { businessToday } from "@/features/alerts/util/pastAlerts";
import {
  TRANSPORTATION_TITLE,
  transportationWindowEnd,
} from "@/features/alerts/util/transportationWindow";

type AlertCountRow = {
  entity_uuid: string | null;
  entity_type: string | null;
  cnt: string;
};

/**
 * Counts the alerts the grid badge should show, per entity.
 *
 * The same two rules the alerts dropdown applies, pushed into SQL because this feeds the PixiJS
 * grid and the table runs to tens of thousands of rows:
 *
 *  - nothing whose entity is already past (docs/specs/no-past-alerts.md), and
 *  - "No Transportation" only for events starting inside the booking window.
 *
 * An entity with no date is counted: it may simply not be synced to this user, and the server
 * cleanup decides those.
 */
export function compileAlertCountsQuery(today: string, windowEnd: string) {
  return db
    .selectFrom("Alerts as a")
    .leftJoin("Events as ev", (join) =>
      join.onRef("ev.id", "=", "a.entity_uuid").on("a.entity_type", "=", "event"),
    )
    .leftJoin("BleacherEvents as be", (join) =>
      join.onRef("be.id", "=", "a.entity_uuid").on("a.entity_type", "=", "bleacher_event"),
    )
    .leftJoin("Events as bev", "bev.id", "be.event_uuid")
    .leftJoin("WorkTrackers as wt", (join) =>
      join.onRef("wt.id", "=", "a.entity_uuid").on("a.entity_type", "=", "work_tracker"),
    )
    .select(({ fn }) => ["a.entity_uuid", "a.entity_type", fn.count<string>("a.id").as("cnt")])
    .where((eb) =>
      eb.or([
        eb(eb.fn.coalesce("ev.event_end", "bev.event_end", "wt.date"), "is", null),
        eb(eb.fn.coalesce("ev.event_end", "bev.event_end", "wt.date"), ">=", today),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("a.title", "!=", TRANSPORTATION_TITLE),
        eb(eb.fn.coalesce("ev.event_start", "bev.event_start", "wt.date"), "is", null),
        eb.and([
          eb(eb.fn.coalesce("ev.event_start", "bev.event_start", "wt.date"), ">=", today),
          eb(eb.fn.coalesce("ev.event_start", "bev.event_start", "wt.date"), "<=", windowEnd),
        ]),
      ]),
    )
    .groupBy(["a.entity_uuid", "a.entity_type"])
    .compile();
}

export function usePsAlertCounts() {
  // Recompiles when the day (and therefore the window) rolls over.
  const today = businessToday();
  const windowEnd = transportationWindowEnd();
  const compiled = useMemo(() => compileAlertCountsQuery(today, windowEnd), [today, windowEnd]);

  const { data: alertRows } = useTypedQuery(compiled, expect<AlertCountRow>());
  const prevKeyRef = useRef("");

  useEffect(() => {
    const rows = alertRows ?? [];
    const key = rows.map((r) => `${r.entity_uuid}:${r.entity_type}:${r.cnt}`).join("|");
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    const byEvent = new Map<string, number>();
    const byBe = new Map<string, number>();
    const byWt = new Map<string, number>();
    for (const row of rows) {
      if (!row.entity_uuid) continue;
      const count = parseInt(row.cnt, 10) || 0;
      if (row.entity_type === "event") {
        byEvent.set(row.entity_uuid, (byEvent.get(row.entity_uuid) ?? 0) + count);
      } else if (row.entity_type === "bleacher_event") {
        byBe.set(row.entity_uuid, (byBe.get(row.entity_uuid) ?? 0) + count);
      } else if (row.entity_type === "work_tracker") {
        byWt.set(row.entity_uuid, (byWt.get(row.entity_uuid) ?? 0) + count);
      }
    }
    useAlertCountsStore.setState({
      byEventUuid: byEvent,
      byBleacherEventUuid: byBe,
      byWorkTrackerUuid: byWt,
    });
  }, [alertRows]);
}
