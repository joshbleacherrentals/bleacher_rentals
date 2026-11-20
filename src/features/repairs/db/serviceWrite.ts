import React from "react";
import type { CompiledQuery } from "kysely";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import {
  SERVICE_FORM_MESSAGES,
  amountTextToCents,
  changedServiceFields,
  isServicesDraftChanged,
  normalizeDescription,
  serviceFormCents,
  validateServiceForm,
  type ServiceFormErrors,
  type ServiceFormValues,
  type ServicesDraft,
} from "../utils/serviceForm";

/**
 * The writes of a service: Add service, Save of an Edit and Delete, and the statements a draft
 * writes with its repair. Local-first, through the app's Kysely and one local transaction per action
 * (docs/POWERSYNC_ARCHITECTURE.md). The statements are built apart from the run so that they are
 * tested on SQLite, and the writers validate before they write. A service write never writes the
 * repair's `cost_cents` (the server's trigger does), its junction, its zone or a damage report.
 * docs/specs/repairs-09b1-services.md §2.5, §2.6 and §3 (D151 to D161; the signatures here are
 * locked by that spec).
 */

export type CreateServiceInput = {
  id: string; // a new uuid, chosen by the caller
  repairId: string;
  values: ServiceFormValues;
  now: string; // an ISO timestamp: created_at
};

/**
 * The insert of §2.5. Never writes `cost_cents` (D159). A service needs a bleacher and a severity:
 * the writers check that before they get here, so a statement without them is a bug and throws.
 */
export function buildCreateServiceStatement(input: CreateServiceInput): CompiledQuery {
  const { id, repairId, values, now } = input;
  if (!values.bleacherUuid || !values.severity) {
    throw new Error("A service needs a bleacher and a severity.");
  }
  const cents = serviceFormCents(values);
  return db
    .insertInto("MaintenanceLineItems")
    .values({
      id,
      maintenance_event_uuid: repairId,
      bleacher_uuid: values.bleacherUuid,
      damage_category_uuid: values.categoryUuid,
      severity: values.severity,
      description: normalizeDescription(values.description),
      labor_cents: cents.laborCents,
      parts_cents: cents.partsCents,
      tax_cents: cents.taxCents,
      freight_cents: cents.freightCents,
      created_at: now,
      deleted: 0,
    })
    .compile();
}

export type UpdateServiceInput = {
  serviceId: string;
  initial: ServiceFormValues;
  values: ServiceFormValues;
};

/** The update of the changed columns only (D155); null when nothing changed. */
export function buildUpdateServiceStatement(input: UpdateServiceInput): CompiledQuery | null {
  const { serviceId, initial, values } = input;
  const columns: Record<string, string | number | null> = {};
  for (const field of changedServiceFields(initial, values)) {
    switch (field) {
      case "bleacherUuid":
        columns.bleacher_uuid = values.bleacherUuid;
        break;
      case "categoryUuid":
        columns.damage_category_uuid = values.categoryUuid;
        break;
      case "severity":
        columns.severity = values.severity;
        break;
      case "description":
        columns.description = normalizeDescription(values.description);
        break;
      case "laborText":
        columns.labor_cents = amountTextToCents(values.laborText);
        break;
      case "partsText":
        columns.parts_cents = amountTextToCents(values.partsText);
        break;
      case "taxText":
        columns.tax_cents = amountTextToCents(values.taxText);
        break;
      case "freightText":
        columns.freight_cents = amountTextToCents(values.freightText);
        break;
    }
  }
  if (Object.keys(columns).length === 0) return null;
  return db.updateTable("MaintenanceLineItems").set(columns).where("id", "=", serviceId).compile();
}

/** `deleted` = 1 on one service. */
export function buildDeleteServiceStatement(serviceId: string): CompiledQuery {
  return db
    .updateTable("MaintenanceLineItems")
    .set({ deleted: 1 })
    .where("id", "=", serviceId)
    .compile();
}

/** The moment plus `index` milliseconds; the moment itself for the first. */
function momentPlus(now: string, index: number): string {
  return index === 0 ? now : new Date(Date.parse(now) + index).toISOString();
}

/**
 * The statements of a draft on Save, in the order of §2.6: the inserts of the added services (with
 * `created_at` = `now` plus the entry's index among the added ones, in milliseconds), the updates of
 * the changed stored services (changed columns only), `deleted` = 1 for the removed stored ones.
 * Empty when the draft is unchanged.
 */
export function buildServicesDraftStatements(input: {
  repairId: string;
  draft: ServicesDraft;
  now: string;
}): CompiledQuery[] {
  const { repairId, draft, now } = input;
  if (!isServicesDraftChanged(draft)) return [];

  const inserts: CompiledQuery[] = [];
  const updates: CompiledQuery[] = [];
  const removals: CompiledQuery[] = [];
  for (const entry of draft) {
    if (entry.stored === null || entry.initial === null) {
      if (entry.removed) continue;
      inserts.push(
        buildCreateServiceStatement({
          id: entry.id,
          repairId,
          values: entry.values,
          now: momentPlus(now, inserts.length),
        }),
      );
    } else if (entry.removed) {
      removals.push(buildDeleteServiceStatement(entry.id));
    } else {
      const update = buildUpdateServiceStatement({
        serviceId: entry.id,
        initial: entry.initial,
        values: entry.values,
      });
      if (update) updates.push(update);
    }
  }
  return [...inserts, ...updates, ...removals];
}

function showErrorToast(lines: string[]) {
  toast.custom(
    (t) =>
      React.createElement(ErrorToast, {
        id: t,
        lines,
      }),
    { duration: 10000 },
  );
}

/** One batch; a failure shows the message with the error text and is thrown again (D155). */
async function writeBatch(statements: CompiledQuery[], message: string): Promise<void> {
  try {
    await typedExecuteBatch(statements);
  } catch (e) {
    showErrorToast([message, String(e)]);
    throw e;
  }
}

/**
 * Validates (`validateServiceForm`), writes one insert with `typedExecuteBatch`, and returns null when
 * written or the errors when nothing was written. A write error shows an `ErrorToast` (`saveFailed`
 * and the error text) and is thrown again.
 */
export async function createService(
  input: Omit<CreateServiceInput, "id">,
): Promise<ServiceFormErrors | null> {
  const errors = validateServiceForm(input.values);
  if (Object.keys(errors).length > 0) return errors;
  await writeBatch(
    [buildCreateServiceStatement({ ...input, id: crypto.randomUUID() })],
    SERVICE_FORM_MESSAGES.saveFailed,
  );
  return null;
}

/** The same for an Edit. Nothing changed: nothing is checked and nothing is written. */
export async function updateService(input: UpdateServiceInput): Promise<ServiceFormErrors | null> {
  if (changedServiceFields(input.initial, input.values).length === 0) return null;
  const errors = validateServiceForm(input.values);
  if (Object.keys(errors).length > 0) return errors;
  const statement = buildUpdateServiceStatement(input);
  if (!statement) return null;
  await writeBatch([statement], SERVICE_FORM_MESSAGES.saveFailed);
  return null;
}

/** One update; a write error shows `deleteFailed` with the error text and is thrown again. */
export async function deleteService(serviceId: string): Promise<void> {
  await writeBatch([buildDeleteServiceStatement(serviceId)], SERVICE_FORM_MESSAGES.deleteFailed);
}
