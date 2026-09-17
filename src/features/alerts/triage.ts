"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { syncAlert, planAlert, deleteAllAlertsForEntity } from "./engine";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import type { CompiledQuery } from "kysely";
import { getDefinitionsForEntity } from "./registry";
import { todayStart, upcomingWindowEndInstant } from "./util/getUpcomingWindow";
import { perfNote, startTrace } from "@/lib/perf/perfTrace";
import { runCascade } from "./cascadeQueue";

type TriageTable = "Events" | "Events_deleted" | "WorkTrackers" | "WorkTrackers_deleted";

type BeRow = { id: string; bleacher_uuid: string | null };
type RelatedBeRow = { id: string };
type WtIdRow = { id: string };
type EventDeletedRow = { deleted: number | null };
type WtDbRow = {
  id: string;
  bleacher_uuid: string | null;
  date: string | null;
};

type WorkTrackerTriageRow = WtDbRow & {
  previous_bleacher_uuid?: string | null;
};

export async function triage(
  table: TriageTable,
  row: { id: string; [key: string]: any },
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  switch (table) {
    case "Events":
      await triageEventSaved(row.id, supabase);
      break;
    case "Events_deleted":
      await triageEventDeleted(row.id, supabase);
      break;
    case "WorkTrackers":
      await triageWorkTrackerSaved(row.id, row.previous_bleacher_uuid ?? null, supabase);
      break;
    case "WorkTrackers_deleted":
      await triageWorkTrackerDeleted(row.id, row.bleacher_uuid, supabase);
      break;
  }
}

async function triageEventSaved(
  eventUuid: string,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  console.log("[QUOTE_TRIAGE] triageEventSaved called for", eventUuid);
  // Soft-delete path: if the event is flagged deleted, handle it as a delete triage.
  const eventRows = await typedGetAll(
    db
      .selectFrom("Events as e")
      .select(["e.deleted as deleted"])
      .where("e.id", "=", eventUuid)
      .limit(1)
      .compile(),
    expect<EventDeletedRow>(),
  );
  const event = eventRows[0];
  console.log(
    "[QUOTE_TRIAGE] event lookup result:",
    event ? `deleted=${event.deleted}` : "NOT FOUND",
  );
  if (!event) return;
  if (event.deleted === 1) {
    await triageEventDeleted(eventUuid, supabase);
    return;
  }

  // 1. Find all bleacher_events for this event
  const bes = await typedGetAll(
    db
      .selectFrom("BleacherEvents as be")
      .select(["be.id as id", "be.bleacher_uuid as bleacher_uuid"])
      .where("be.event_uuid", "=", eventUuid)
      .compile(),
    expect<BeRow>(),
  );
  const bleacherUuids = [...new Set(bes.map((be) => be.bleacher_uuid).filter(Boolean))] as string[];
  console.log(
    "[QUOTE_TRIAGE] bleacherEvents found:",
    bes.length,
    "unique bleachers:",
    bleacherUuids.length,
  );

  // 2. Run event-level alerts on this event
  const eventDefs = getDefinitionsForEntity("event");
  console.log(
    "[QUOTE_TRIAGE] running",
    eventDefs.length,
    "event-level defs:",
    eventDefs.map((d) => d.title),
  );
  for (const def of eventDefs) {
    await syncAlert(def, eventUuid, supabase);
  }

  // 3. Run bleacher_event-level alerts on this event's bleacher_events
  const beDefs = getDefinitionsForEntity("bleacher_event");
  for (const be of bes) {
    for (const def of beDefs) {
      await syncAlert(def, be.id, supabase);
    }
  }

  // 4. Find OTHER bleacher_events on the same bleachers (ripple effect)
  //    These could be affected by this event changing the "last known location"
  //    or resolving/creating scheduling conflicts
  if (bleacherUuids.length > 0) {
    const relatedBEs = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .select(["be.id as id"])
        .where("be.bleacher_uuid", "in", bleacherUuids)
        .where("be.event_uuid", "!=", eventUuid)
        .where("e.deleted", "=", 0)
        .where("e.event_start", ">=", todayStart())
        .compile(),
      expect<RelatedBeRow>(),
    );

    for (const rbe of relatedBEs) {
      for (const def of beDefs) {
        await syncAlert(def, rbe.id, supabase);
      }
    }

    // 5. Find work trackers on these bleachers (could affect WT transportation alerts)
    const wtDefs = getDefinitionsForEntity("work_tracker");
    if (wtDefs.length > 0) {
      const relatedWTs = await typedGetAll(
        db
          .selectFrom("WorkTrackers as wt")
          .select(["wt.id as id"])
          .where("wt.bleacher_uuid", "in", bleacherUuids)
          .where("wt.date", ">=", todayStart())
          .compile(),
        expect<WtIdRow>(),
      );

      for (const wt of relatedWTs) {
        for (const def of wtDefs) {
          await syncAlert(def, wt.id, supabase);
        }
      }
    }
  }
}

async function triageEventDeleted(
  eventUuid: string,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  // Find bleacher_events for this event before they get cascade-deleted
  const bes = await typedGetAll(
    db
      .selectFrom("BleacherEvents as be")
      .select(["be.id as id", "be.bleacher_uuid as bleacher_uuid"])
      .where("be.event_uuid", "=", eventUuid)
      .compile(),
    expect<BeRow>(),
  );
  const bleacherUuids = [...new Set(bes.map((be) => be.bleacher_uuid).filter(Boolean))] as string[];

  // Delete alerts on this event and its bleacher_events
  await deleteAllAlertsForEntity(eventUuid);
  for (const be of bes) {
    await deleteAllAlertsForEntity(be.id);
  }

  // Re-evaluate neighboring bleacher_events and work trackers
  if (bleacherUuids.length > 0) {
    const beDefs = getDefinitionsForEntity("bleacher_event");
    const relatedBEs = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .select(["be.id as id"])
        .where("be.bleacher_uuid", "in", bleacherUuids)
        .where("be.event_uuid", "!=", eventUuid)
        .where("e.deleted", "=", 0)
        .where("e.event_start", ">=", todayStart())
        .compile(),
      expect<RelatedBeRow>(),
    );

    for (const rbe of relatedBEs) {
      for (const def of beDefs) {
        await syncAlert(def, rbe.id, supabase);
      }
    }

    const wtDefs = getDefinitionsForEntity("work_tracker");
    if (wtDefs.length > 0) {
      const relatedWTs = await typedGetAll(
        db
          .selectFrom("WorkTrackers as wt")
          .select(["wt.id as id"])
          .where("wt.bleacher_uuid", "in", bleacherUuids)
          .where("wt.date", ">=", todayStart())
          .compile(),
        expect<WtIdRow>(),
      );

      for (const wt of relatedWTs) {
        for (const def of wtDefs) {
          await syncAlert(def, wt.id, supabase);
        }
      }
    }
  }
}

/**
 * Bleachers a tracker has been moved off since the last cascade started.
 *
 * Collapsing a burst would otherwise lose them: dragging A → B → C faster than
 * one cascade completes leaves the trailing run knowing only about A and C, and
 * the events sitting on B would keep a stale transportation alert until the
 * nightly cron. Each run drains the set, so requests arriving mid-run are picked
 * up by the trailing run rather than dropped.
 */
const pendingPreviousBleachers = new Map<string, Set<string>>();

async function triageWorkTrackerSaved(
  workTrackerUuid: string,
  previousBleacherUuid: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  if (previousBleacherUuid) {
    const pending = pendingPreviousBleachers.get(workTrackerUuid) ?? new Set<string>();
    pending.add(previousBleacherUuid);
    pendingPreviousBleachers.set(workTrackerUuid, pending);
  }

  return runCascade(workTrackerUuid, () => runWorkTrackerCascade(workTrackerUuid, supabase));
}

async function runWorkTrackerCascade(
  workTrackerUuid: string,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  const previousBleacherUuids = pendingPreviousBleachers.get(workTrackerUuid) ?? new Set<string>();
  pendingPreviousBleachers.delete(workTrackerUuid);
  const rows = await typedGetAll(
    db
      .selectFrom("WorkTrackers as wt")
      .select(["wt.id as id", "wt.bleacher_uuid as bleacher_uuid", "wt.date as date"])
      .where("wt.id", "=", workTrackerUuid)
      .limit(1)
      .compile(),
    expect<WtDbRow>(),
  );
  const wt = rows[0];
  if (!wt) return;

  const trace = startTrace("triageWorkTrackerSaved");

  // Every statement the cascade derives is collected and committed once, at the
  // end. Writing them as they were derived meant ~100 transactions, each an
  // IndexedDB round-trip that also woke every watched query on the table.
  const statements: CompiledQuery<any>[] = [];

  // 1. Run work_tracker-level alerts on this work tracker
  const wtDefs = getDefinitionsForEntity("work_tracker");
  for (const def of wtDefs) {
    statements.push(...(await planAlert(def, wt.id, supabase)));
  }
  trace.mark(`work_tracker defs (${wtDefs.length})`);

  // 2. Find upcoming bleacher_events for this bleacher (ripple effect on transportation)
  const bleacherUuids = [
    ...new Set([...previousBleacherUuids, wt.bleacher_uuid].filter(Boolean)),
  ] as string[];
  if (bleacherUuids.length > 0) {
    const beDefs = getDefinitionsForEntity("bleacher_event");
    const relatedBEs = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .select(["be.id as id"])
        .where("be.bleacher_uuid", "in", bleacherUuids)
        .where("e.deleted", "=", 0)
        .where("e.event_start", ">=", todayStart())
        // Bounded to the same window the cron job and the work tracker
        // definitions use: outside it no alert can fire, so evaluating events a
        // year out was pure cost. This bound is the multiplier on every save.
        .where("e.event_start", "<=", upcomingWindowEndInstant())
        .compile(),
      expect<RelatedBeRow>(),
    );

    perfNote(
      `alert ripple: ${relatedBEs.length} in-window bleacher_events × ${beDefs.length} defs = ${relatedBEs.length * beDefs.length} sequential syncAlert calls`,
    );

    for (const rbe of relatedBEs) {
      for (const def of beDefs) {
        statements.push(...(await planAlert(def, rbe.id, supabase)));
      }
    }
    trace.mark(`bleacher_event defs (${relatedBEs.length * beDefs.length} calls)`);
  }

  await typedExecuteBatch(statements);
  trace.mark(`commit (${statements.length} statements)`);

  trace.end({ workTrackerUuid, bleacherUuids, statements: statements.length });
}

async function triageWorkTrackerDeleted(
  workTrackerUuid: string,
  bleacherUuid: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  await deleteAllAlertsForEntity(workTrackerUuid);

  if (bleacherUuid) {
    const beDefs = getDefinitionsForEntity("bleacher_event");
    const relatedBEs = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Events as e", "e.id", "be.event_uuid")
        .select(["be.id as id"])
        .where("be.bleacher_uuid", "=", bleacherUuid)
        .where("e.deleted", "=", 0)
        .where("e.event_start", ">=", todayStart())
        .compile(),
      expect<RelatedBeRow>(),
    );

    for (const rbe of relatedBEs) {
      for (const def of beDefs) {
        await syncAlert(def, rbe.id, supabase);
      }
    }
  }
}
