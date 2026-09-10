"use client";

import { useMemo } from "react";
import { sql, type CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { useUserAccess } from "@/features/userAccess/client";
import { todayLocal } from "../logic/dateOnly";
import { countUnseen, decorateQueue } from "../logic/decorateQueue";
import { receivesInspectionNotifications } from "../logic/receivesInspectionNotifications";

export type AnnualInspectionQueueRow = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  inspectionId: string | null;
  inspectedOn: string | null;
  nextDueOn: string | null;
  documentPath: string | null;
  notes: string | null;
};

export type AnnualInspectionRow = {
  id: string;
  created_at: string | null;
  created_by: string | null;
  bleacher_uuid: string | null;
  inspected_on: string | null;
  next_due_on: string | null;
  document_path: string | null;
  notes: string | null;
};

/**
 * Every bleacher with its current inspection record, in the order the queue is
 * worked.
 *
 * The current record is the most recently created row for that bleacher; a
 * correlated subquery picks it rather than a GROUP BY, so a bleacher with no
 * inspection at all still appears — those are the ones most at risk of being
 * forgotten, and dropping them would hide exactly the wrong bleachers.
 *
 * Ordering needs no notion of today: nulls first, then ascending due date puts
 * overdue ahead of red, red ahead of yellow, and yellow ahead of ok on its own.
 */
export function buildInspectionQueueQuery(): CompiledQuery<AnnualInspectionQueueRow> {
  return db
    .selectFrom("Bleachers as b")
    .leftJoin("BleacherAnnualInspections as i", (join) =>
      join.on(
        "i.id",
        "=",
        sql<string>`(
          select i2.id
            from "BleacherAnnualInspections" i2
           where i2.bleacher_uuid = b.id
           order by i2.created_at desc, i2.id desc
           limit 1
        )`,
      ),
    )
    .select([
      "b.id as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "i.id as inspectionId",
      "i.inspected_on as inspectedOn",
      "i.next_due_on as nextDueOn",
      "i.document_path as documentPath",
      "i.notes as notes",
    ])
    .where((eb) => eb.or([eb("b.deleted", "=", 0), eb("b.deleted", "is", null)]))
    .orderBy(sql`i.next_due_on is null`, "desc")
    .orderBy("i.next_due_on", "asc")
    .orderBy("b.bleacher_number", "asc")
    .compile() as CompiledQuery<AnnualInspectionQueueRow>;
}

/** Every inspection ever recorded for one bleacher, newest first. */
export function buildInspectionHistoryQuery(
  bleacherUuid: string,
): CompiledQuery<AnnualInspectionRow> {
  return db
    .selectFrom("BleacherAnnualInspections")
    .selectAll()
    .where("bleacher_uuid", "=", bleacherUuid)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .compile() as CompiledQuery<AnnualInspectionRow>;
}

export function useInspectionQueue(): AnnualInspectionQueueRow[] {
  const compiled = useMemo(() => buildInspectionQueueQuery(), []);
  const { data } = useTypedQuery(compiled, expect<AnnualInspectionQueueRow>());
  return data ?? [];
}

export function useInspectionHistory(bleacherUuid: string | null): AnnualInspectionRow[] {
  const compiled = useMemo(
    () => buildInspectionHistoryQuery(bleacherUuid ?? "__no_bleacher__"),
    [bleacherUuid],
  );
  const { data } = useTypedQuery(compiled, expect<AnnualInspectionRow>());
  return data ?? [];
}

/**
 * How many bleachers crossed a threshold since this user last opened the page,
 * for the one role that is supposed to hear about it.
 *
 * Returns a number, not the rows: the sidebar renders this on every navigation,
 * and subscribing it to an array would re-render the whole shell whenever any
 * inspection anywhere changed.
 *
 * The role gate lives here rather than at the call site so there is a single
 * answer to "who gets notified" — an administrator and a viewer can both open
 * the queue and neither is chased by it.
 */
export function useUnseenInspectionCount(): number {
  const queue = useInspectionQueue();
  const { data: userData } = useCurrentUser();
  const access = useUserAccess();
  const lastSeenAt = userData?.[0]?.inspection_queue_last_seen_at ?? null;
  const notified = access.status === "active" && receivesInspectionNotifications(access.roles);

  return useMemo(
    () => (notified ? countUnseen(decorateQueue(queue, todayLocal(), lastSeenAt)) : 0),
    [notified, queue, lastSeenAt],
  );
}

export async function recordInspection(input: {
  bleacherUuid: string;
  inspectedOn: string | null;
  nextDueOn: string;
  documentPath: string | null;
  notes: string | null;
  createdBy: string | null;
}): Promise<void> {
  const compiled = db
    .insertInto("BleacherAnnualInspections")
    .values({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      created_by: input.createdBy,
      bleacher_uuid: input.bleacherUuid,
      inspected_on: input.inspectedOn,
      next_due_on: input.nextDueOn,
      document_path: input.documentPath,
      notes: input.notes,
    })
    .compile();

  await typedExecute(compiled);
}

/** Corrects an existing record. A *new* inspection is a new row, not an edit. */
export async function updateInspection(input: {
  id: string;
  inspectedOn: string | null;
  nextDueOn: string;
  documentPath: string | null;
  notes: string | null;
}): Promise<void> {
  const compiled = db
    .updateTable("BleacherAnnualInspections")
    .set({
      inspected_on: input.inspectedOn,
      next_due_on: input.nextDueOn,
      document_path: input.documentPath,
      notes: input.notes,
    })
    .where("id", "=", input.id)
    .compile();

  await typedExecute(compiled);
}

/**
 * Stamp the user as having seen the queue as it stands now.
 *
 * Idempotent, and written on every mount of the page — the same contract as
 * markChangelogRead.
 */
export async function markInspectionQueueSeen(userUuid: string): Promise<void> {
  const compiled = db
    .updateTable("Users")
    .set({ inspection_queue_last_seen_at: new Date().toISOString() })
    .where("id", "=", userUuid)
    .compile();

  await typedExecute(compiled);
}
