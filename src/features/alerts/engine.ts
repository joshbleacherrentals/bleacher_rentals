"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import type { CompiledQuery } from "kysely";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../database.types";
import { AlertDefinition, AlertEntityType, AlertPayload } from "./types";
import { dbOpCounts, formatDuration, perfVerbose } from "@/lib/perf/perfTrace";
import { getAlertEntityDate, isPastBusinessDate } from "./util/pastAlerts";

type AlertRow = {
  id: string;
  message: string | null;
  entity_description: string | null;
};

type IdRow = { id: string };

/**
 * Builds the statements that would bring `Alerts`/`UserAlerts` in line with the
 * given payloads, without touching the DB.
 *
 * Splitting planning from execution is what lets a whole cascade commit as one
 * transaction: the caller collects the plans of every alert it evaluated and
 * applies them together. Statements come back in foreign-key-safe order —
 * deletes (UserAlerts before Alerts), then updates, then inserts (Alerts before
 * its UserAlerts).
 *
 * An entity that is already past (docs/specs/no-past-alerts.md) never gets an alert: its payloads
 * are dropped, so any alert it still has is planned for deletion. Every alert write — definition
 * evaluation, cascades and review requests — comes through here, so this is the one gate.
 */
export async function planAlertsForEntity(
  title: string,
  entityUuid: string,
  entityType: AlertEntityType,
  alerts: AlertPayload[],
  recipientUuids: string[],
): Promise<CompiledQuery<any>[]> {
  let myAlerts = alerts.filter((a) => a.title === title);

  if (myAlerts.length > 0) {
    try {
      if (isPastBusinessDate(await getAlertEntityDate(entityType, entityUuid))) myAlerts = [];
    } catch (err) {
      console.error(`[${title}] failed to read entity date; not gating`, err);
    }
  }

  let existing: AlertRow[];
  try {
    existing = await typedGetAll(
      db
        .selectFrom("Alerts as a")
        .select([
          "a.id as id",
          "a.message as message",
          "a.entity_description as entity_description",
        ])
        .where("a.entity_uuid", "=", entityUuid)
        .where("a.entity_type", "=", entityType)
        .where("a.title", "=", title)
        .compile(),
      expect<AlertRow>(),
    );
  } catch (err) {
    console.error(`[${title}] failed to fetch existing alerts`, err);
    return [];
  }

  const existingMessages = new Set(existing.map((a) => a.message ?? ""));
  const currentMessages = new Set(myAlerts.map((a) => a.message));

  const toDelete = existing.filter((a) => !currentMessages.has(a.message ?? ""));
  const toInsert = myAlerts.filter((a) => !existingMessages.has(a.message));
  const toUpdate = myAlerts.filter((a) => {
    const match = existing.find((e) => e.message === a.message);
    return match && match.entity_description !== a.entity_description;
  });

  const statements: CompiledQuery<any>[] = [];

  for (const alert of toDelete) {
    statements.push(db.deleteFrom("UserAlerts").where("alert_uuid", "=", alert.id).compile());
    statements.push(db.deleteFrom("Alerts").where("id", "=", alert.id).compile());
  }

  for (const alert of toUpdate) {
    const match = existing.find((e) => e.message === alert.message)!;
    statements.push(
      db
        .updateTable("Alerts")
        .set({ entity_description: alert.entity_description } as any)
        .where("id", "=", match.id)
        .compile(),
    );
  }

  const uniqueRecipients = [...new Set(recipientUuids.filter(Boolean))];
  for (const alert of toInsert) {
    const alertId = crypto.randomUUID();
    statements.push(
      db
        .insertInto("Alerts")
        .values({
          id: alertId,
          entity_uuid: entityUuid,
          entity_type: entityType,
          title: alert.title,
          message: alert.message,
          entity_description: alert.entity_description,
        } as any)
        .compile(),
    );
    for (const userUuid of uniqueRecipients) {
      statements.push(
        db
          .insertInto("UserAlerts")
          .values({ id: crypto.randomUUID(), alert_uuid: alertId, user_uuid: userUuid } as any)
          .compile(),
      );
    }
  }

  return statements;
}

/**
 * Syncs alerts for a given entity+title against the local PowerSync DB.
 * Deletes stale alerts, updates changed descriptions, inserts new ones.
 * PowerSync replicates all changes up to Supabase automatically.
 */
export async function syncAlertsForEntity(
  title: string,
  entityUuid: string,
  entityType: AlertEntityType,
  alerts: AlertPayload[],
  recipientUuids: string[],
): Promise<void> {
  await typedExecuteBatch(
    await planAlertsForEntity(title, entityUuid, entityType, alerts, recipientUuids),
  );
}

/**
 * Deletes all alerts (and their UserAlerts) for a specific entity+title.
 */
export async function deleteAlertsForEntity(title: string, entityUuid: string): Promise<void> {
  let rows: IdRow[];
  try {
    rows = await typedGetAll(
      db
        .selectFrom("Alerts as a")
        .select(["a.id as id"])
        .where("a.entity_uuid", "=", entityUuid)
        .where("a.title", "=", title)
        .compile(),
      expect<IdRow>(),
    );
  } catch (err) {
    console.error(`[${title}] failed to fetch alerts for deletion`, err);
    return;
  }

  for (const row of rows) {
    await typedExecute(db.deleteFrom("UserAlerts").where("alert_uuid", "=", row.id).compile());
    await typedExecute(db.deleteFrom("Alerts").where("id", "=", row.id).compile());
  }
}

/**
 * Deletes every alert (and their UserAlerts) associated with an entity UUID
 * regardless of title.
 */
export async function deleteAllAlertsForEntity(entityUuid: string): Promise<void> {
  let rows: IdRow[];
  try {
    rows = await typedGetAll(
      db
        .selectFrom("Alerts as a")
        .select(["a.id as id"])
        .where("a.entity_uuid", "=", entityUuid)
        .compile(),
      expect<IdRow>(),
    );
  } catch (err) {
    console.error(`[deleteAllAlertsForEntity] failed to fetch alerts`, err);
    return;
  }

  for (const row of rows) {
    await typedExecute(db.deleteFrom("UserAlerts").where("alert_uuid", "=", row.id).compile());
    await typedExecute(db.deleteFrom("Alerts").where("id", "=", row.id).compile());
  }
}

/**
 * Evaluates a single AlertDefinition for a given entity and syncs the result
 * to the local PowerSync DB (which replicates to Supabase).
 *
 * The `supabase` client is still needed for `definition.evaluate()` and
 * `definition.recipients()` which query Supabase for evaluation logic.
 */
/**
 * Evaluates a single AlertDefinition and returns the statements needed to bring
 * the DB in line with the result, without writing anything.
 *
 * This is the form a cascade uses: it evaluates dozens of definitions and
 * commits all of their statements in one transaction.
 */
export async function planAlert(
  definition: AlertDefinition,
  entityUuid: string,
  supabase?: SupabaseClient<Database>,
): Promise<CompiledQuery<any>[]> {
  // Per-call timing is opt-in (`localStorage.perfTrace = "1"`): there can be
  // hundreds of these in one save, and logging them all is itself a cost.
  const startedAt = performance.now();
  const startCounts = dbOpCounts();

  const result = await definition.evaluate(entityUuid, supabase);
  const alerts: AlertPayload[] = result
    ? [
        {
          entity_uuid: entityUuid,
          entity_type: definition.entityType,
          title: definition.title,
          message: result.message,
          entity_description: result.entityDescription,
        },
      ]
    : [];
  const recipients = result ? await definition.recipients(entityUuid, supabase) : [];

  const statements = await planAlertsForEntity(
    definition.title,
    entityUuid,
    definition.entityType,
    alerts,
    recipients,
  );

  const endCounts = dbOpCounts();
  perfVerbose(
    `planAlert "${definition.title}" ${formatDuration(performance.now() - startedAt)} ` +
      `(${endCounts.reads - startCounts.reads} reads, ${statements.length} statements planned)`,
  );

  return statements;
}

/**
 * Evaluates a single AlertDefinition for a given entity and writes the result
 * to the local PowerSync DB (which replicates to Supabase).
 *
 * Callers that evaluate many definitions at once should prefer `planAlert` and
 * commit the collected statements in one transaction.
 */
export async function syncAlert(
  definition: AlertDefinition,
  entityUuid: string,
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  await typedExecuteBatch(await planAlert(definition, entityUuid, supabase));
}
