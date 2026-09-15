"use client";

import { AlertDefinition, AlertPayload, InMemoryAlertContext } from "../types";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";

type BeRow = {
  bleacher_uuid: string | null;
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
  setup_start: string | null;
  teardown_end: string | null;
  event_status: string | null;
  bleacher_number: number | null;
  created_by_user_uuid: string | null;
};

type OtherBeRow = {
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
  setup_start: string | null;
  teardown_end: string | null;
};

export const schedulingConflict: AlertDefinition = {
  title: "Scheduling Conflict",
  entityType: "bleacher_event",

  async evaluate(bleacherEventUuid, _supabase) {
    const beRows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .select([
          "be.bleacher_uuid as bleacher_uuid",
          "e.event_name as event_name",
          "e.event_start as event_start",
          "e.event_end as event_end",
          "e.setup_start as setup_start",
          "e.teardown_end as teardown_end",
          "e.event_status as event_status",
          "b.bleacher_number as bleacher_number",
          "e.created_by_user_uuid as created_by_user_uuid",
        ])
        .where("be.id", "=", bleacherEventUuid)
        .where("e.deleted", "=", 0)
        .limit(1)
        .compile(),
      expect<BeRow>(),
    );

    const be = beRows[0];
    if (!be || !be.bleacher_uuid || !be.event_start || !be.event_end) return null;
    if (be.event_status !== "booked") return null;

    const start = new Date(be.setup_start ?? be.event_start);
    const end = new Date(be.teardown_end ?? be.event_end);
    const DAY_MS = 24 * 60 * 60 * 1000;
    const windowStart = new Date(start.getTime() - DAY_MS).toISOString();
    const windowEnd = new Date(end.getTime() + DAY_MS).toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end < today) return null;

    const otherRows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be2")
        .innerJoin("Events as e2", "e2.id", "be2.event_uuid")
        .select([
          "e2.event_name as event_name",
          "e2.event_start as event_start",
          "e2.event_end as event_end",
          "e2.setup_start as setup_start",
          "e2.teardown_end as teardown_end",
        ])
        .where("be2.bleacher_uuid", "=", be.bleacher_uuid)
        .where("be2.id", "!=", bleacherEventUuid)
        .where("e2.event_status", "=", "booked")
        .where("e2.deleted", "=", 0)
        // An overlap predicate rather than a date window — a conflict can sit
        // anywhere on the calendar. Padded by a day on each side so it stays
        // deliberately WIDER than the JS check below, which remains the source
        // of truth: this only cuts how many rows the loop has to look at.
        .where(
          sql<boolean>`coalesce(${sql.ref("e2.teardown_end")}, ${sql.ref("e2.event_end")}) >= ${windowStart}`,
        )
        .where(
          sql<boolean>`coalesce(${sql.ref("e2.setup_start")}, ${sql.ref("e2.event_start")}) <= ${windowEnd}`,
        )
        .compile(),
      expect<OtherBeRow>(),
    );

    for (const other of otherRows) {
      if (!other.event_start || !other.event_end) continue;
      const oStart = new Date(other.setup_start ?? other.event_start);
      const oEnd = new Date(other.teardown_end ?? other.event_end);

      if (start <= oEnd && oStart <= end) {
        const desc = [
          be.bleacher_number != null ? `Bleacher #${be.bleacher_number}` : null,
          be.event_name,
        ]
          .filter(Boolean)
          .join(" — ");

        return {
          message: `Double booked with ${other.event_name}.`,
          entityDescription: desc || null,
        };
      }
    }

    return null;
  },

  evaluateInMemory({ event, allEvents, allBleacherEvents }: InMemoryAlertContext): AlertPayload[] {
    const alerts: AlertPayload[] = [];
    if (event.selectedStatus !== "booked") return alerts;

    const currentStart = new Date(event.setupStart ?? event.eventStart);
    const currentEnd = new Date(event.teardownEnd ?? event.eventEnd);

    const eventUuidToBleachers: Record<string, string[]> = {};
    for (const be of allBleacherEvents) {
      if (!be.event_uuid || !be.bleacher_uuid) continue;
      if (!eventUuidToBleachers[be.event_uuid]) eventUuidToBleachers[be.event_uuid] = [];
      eventUuidToBleachers[be.event_uuid].push(be.bleacher_uuid);
    }

    for (const other of allEvents) {
      if (other.id === event.eventUuid) continue;
      if (other.event_status !== "booked") continue;

      const oStart = new Date(other.setup_start ?? other.event_start);
      const oEnd = new Date(other.teardown_end ?? other.event_end);

      const bleachersInOther = eventUuidToBleachers[other.id] ?? [];
      const hasOverlap = bleachersInOther.some((id) => event.bleacherUuids.includes(id));
      if (!hasOverlap) continue;

      if (currentStart <= oEnd && oStart <= currentEnd) {
        alerts.push({
          entity_uuid: event.eventUuid,
          entity_type: "event",
          title: "Scheduling Conflict",
          message: "This event is overlapping with other events!",
          entity_description: event.eventName || null,
        });
        break;
      }
    }

    return alerts;
  },

  async recipients(bleacherEventUuid, _supabase) {
    const rows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .select(["e.created_by_user_uuid as created_by_user_uuid"])
        .where("be.id", "=", bleacherEventUuid)
        .where("e.deleted", "=", 0)
        .limit(1)
        .compile(),
      expect<{ created_by_user_uuid: string | null }>(),
    );
    const uuid = rows[0]?.created_by_user_uuid;
    return uuid ? [uuid] : [];
  },
};
