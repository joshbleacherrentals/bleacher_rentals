"use client";

import { AlertDefinition } from "../types";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { resolveAddress } from "@/utils/resolveAddress";
import { localDayEndInstant } from "../util/localDayInstant";

type BeRow = {
  bleacher_uuid: string | null;
  event_name: string | null;
  event_start: string | null;
  event_street: string | null;
  bleacher_number: number | null;
  created_by_user_uuid: string | null;
};

type SiblingBeRow = {
  eventStart: string | null;
  address: string | null;
  eventStatus: string | null;
};
type WtAddrRow = { date: string | null; dropoffAddress: string | null };

export const bleacherTransportation: AlertDefinition = {
  title: "No Transportation",
  entityType: "bleacher_event",

  async evaluate(bleacherEventUuid, _supabase) {
    // Fetch this bleacher event + its event details + bleacher number
    const beRows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .leftJoin("Addresses as a", "a.id", "e.address_uuid")
        .select([
          "be.bleacher_uuid as bleacher_uuid",
          "e.event_name as event_name",
          "e.event_start as event_start",
          "a.street as event_street",
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
    if (!be || !be.bleacher_uuid || !be.event_start || !be.event_street) return null;

    // Fetch all bleacher events for this bleacher with resolved address street
    const siblingBeRows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be2")
        .innerJoin("Events as e2", "e2.id", "be2.event_uuid")
        .innerJoin("Addresses as a2", "a2.id", "e2.address_uuid")
        .select([
          "e2.event_start as eventStart",
          "a2.street as address",
          "e2.event_status as eventStatus",
        ])
        .where("be2.bleacher_uuid", "=", be.bleacher_uuid)
        .where("be2.id", "!=", bleacherEventUuid)
        .where("e2.deleted", "=", 0)
        // Only the single nearest candidate is needed: `resolveAddress` is a
        // max selection. Every filter it applies in JS is mirrored here, because
        // with LIMIT 1 a row rejected in JS yields null rather than letting the
        // next-nearest win.
        .where("e2.event_status", "=", "booked")
        .where("a2.street", "is not", null)
        .where("a2.street", "!=", "")
        .where("e2.event_start", "<=", localDayEndInstant(be.event_start))
        .orderBy("e2.event_start", "desc")
        .limit(1)
        .compile(),
      expect<SiblingBeRow>(),
    );

    // Fetch all work trackers for this bleacher with resolved dropoff address street
    const wtRows = await typedGetAll(
      db
        .selectFrom("WorkTrackers as wt")
        .innerJoin("Addresses as a", "a.id", "wt.dropoff_address_uuid")
        .select(["wt.date as date", "a.street as dropoffAddress"])
        .where("wt.bleacher_uuid", "=", be.bleacher_uuid)
        .where("a.street", "is not", null)
        .where("a.street", "!=", "")
        // Compared against the raw event_start string, exactly as the JS does.
        .where("wt.date", "<=", be.event_start)
        .orderBy("wt.date", "desc")
        .limit(1)
        .compile(),
      expect<WtAddrRow>(),
    );

    const bleacher = {
      bleacherEvents: siblingBeRows
        .filter((r) => r.eventStart != null)
        .map((r) => ({
          booked: r.eventStatus === "booked",
          eventStart: r.eventStart!,
          address: r.address ?? "",
        })),
      workTrackers: wtRows,
    };

    const lastAddress = resolveAddress(bleacher, be.event_start);

    if (!lastAddress || lastAddress === be.event_street) return null;

    const desc = [
      be.bleacher_number != null ? `Bleacher #${be.bleacher_number}` : null,
      be.event_name,
    ]
      .filter(Boolean)
      .join(" — ");

    return {
      message: `Last known location: ${lastAddress}. Event location: ${be.event_street}.`,
      entityDescription: desc || null,
    };
  },

  // evaluateInMemory is intentionally omitted — transportation alerts for the
  // event config form are computed reactively by useEventFormTransportationAlerts
  // using live PowerSync data, which also handles unsaved (new) events.

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
