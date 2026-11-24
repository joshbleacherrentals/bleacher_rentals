import React from "react";
import type { CompiledQuery } from "kysely";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import { NO_CLOSING, type CloseChoice } from "../utils/closeReports";
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
import { writeRepairChanges } from "./repairLinkWrite";

/**
 * The writes of a service: Add service, Save of an Edit and Delete, and the statements a draft
 * writes with its repair. Local-first, through the app's Kysely and one local transaction per action
 * (docs/POWERSYNC_ARCHITECTURE.md). The statements are built apart from the run so that they are
 * tested on SQLite, and the writers validate before they write. A service write never writes the
 * repair's `cost_cents` (the server's trigger does). An added, moved or deleted service goes through
 * `writeRepairChanges`, which also keeps the repair's junction, its zone and its damage report links
 * in step in the same local transaction (docs/specs/repairs-09b2-bleachers-zone-reports.md).
 * docs/specs/repairs-09b1-services.md §2.5, §2.6 and §3 (D151 to D161; the signatures here are
 * locked by that spec and by 09b2 §3). A service that may give a bleacher of a Completed repair its first
 * service asks which damage reports to close, through the optional `chooseClosing`, after validation and
 * before the write (docs/specs/repairs-08a-choose-reports-to-close.md §2.3 and §3, D246).
 */

export type CreateServiceInput = {
  id: string; // a new uuid, chosen by the caller
  repairId: string;
  values: ServiceFormValues;
  now: string; // an ISO timestamp: created_at
  timezone: string; // the app time zone (09b2: the day of a report, D185)
  /** Asks which damage reports to close (08a D246); rejects when the person cancels, which writes nothing. */
  chooseClosing?: () => Promise<CloseChoice>;
};

/**
 * The insert of §2.5. Never writes `cost_cents` (D159). A service needs a bleacher and a severity:
 * the writers check that before they get here, so a statement without them is a bug and throws.
 */
export function buildCreateServiceStatement(
  input: Pick<CreateServiceInput, "id" | "repairId" | "values" | "now">,
): CompiledQuery {
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
  repairId: string;
  now: string;
  timezone: string;
  /** Asks which damage reports to close (08a D246), only when the bleacher changes. */
  chooseClosing?: () => Promise<CloseChoice>;
};

/** The update of the changed columns only (D155); null when nothing changed. */
export function buildUpdateServiceStatement(
  input: Pick<UpdateServiceInput, "serviceId" | "initial" | "values">,
): CompiledQuery | null {
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
 * Validates (`validateServiceForm`), writes the insert through `writeRepairChanges` (one local
 * transaction that also keeps the repair's bleachers, zone and damage report links), and returns null
 * when written or the errors when nothing was written: the validation errors, or the zone refusal
 * under the Bleacher field (D176). A write error shows an `ErrorToast` (`saveFailed` and the error
 * text) and is thrown again.
 */
export async function createService(
  input: Omit<CreateServiceInput, "id">,
): Promise<ServiceFormErrors | null> {
  const errors = validateServiceForm(input.values);
  if (Object.keys(errors).length > 0) return errors;
  const closing = (await input.chooseClosing?.()) ?? NO_CLOSING;
  const now = closing.confirmedAt ?? input.now; // the moment of the Confirm click (08a D239)
  const refusal = await writeRepairChanges({
    repairId: input.repairId,
    statements: [buildCreateServiceStatement({ ...input, id: crypto.randomUUID(), now })],
    servicesAffected: true,
    checkedBleacherUuids: input.values.bleacherUuid ? [input.values.bleacherUuid] : [],
    now,
    timezone: input.timezone,
    failedMessage: SERVICE_FORM_MESSAGES.saveFailed,
    closeFreeIds: closing.closeFreeIds,
  });
  return refusal ? { bleacherUuid: refusal.message } : null;
}

/**
 * The same for an Edit. Nothing changed: nothing is checked and nothing is written. A change that
 * keeps the bleacher is one plain batch with no read (D182); a change of the bleacher goes through
 * `writeRepairChanges` with the new bleacher checked (D176).
 */
export async function updateService(input: UpdateServiceInput): Promise<ServiceFormErrors | null> {
  const changed = changedServiceFields(input.initial, input.values);
  if (changed.length === 0) return null;
  const errors = validateServiceForm(input.values);
  if (Object.keys(errors).length > 0) return errors;
  const statement = buildUpdateServiceStatement(input);
  if (!statement) return null;

  if (!changed.includes("bleacherUuid")) {
    await writeBatch([statement], SERVICE_FORM_MESSAGES.saveFailed);
    return null;
  }
  const closing = (await input.chooseClosing?.()) ?? NO_CLOSING;
  const refusal = await writeRepairChanges({
    repairId: input.repairId,
    statements: [statement],
    servicesAffected: true,
    checkedBleacherUuids: input.values.bleacherUuid ? [input.values.bleacherUuid] : [],
    now: closing.confirmedAt ?? input.now, // the moment of the Confirm click (08a D239)
    timezone: input.timezone,
    failedMessage: SERVICE_FORM_MESSAGES.saveFailed,
    closeFreeIds: closing.closeFreeIds,
  });
  return refusal ? { bleacherUuid: refusal.message } : null;
}

export type DeleteServiceInput = {
  serviceId: string;
  repairId: string;
  now: string;
  timezone: string;
};

/**
 * One update through `writeRepairChanges`, with nothing checked: the bleacher of the service is a
 * loss when it was its last live service (D169). A write error shows `deleteFailed` with the error
 * text and is thrown again.
 */
export async function deleteService(input: DeleteServiceInput): Promise<void> {
  await writeRepairChanges({
    repairId: input.repairId,
    statements: [buildDeleteServiceStatement(input.serviceId)],
    servicesAffected: true,
    checkedBleacherUuids: [],
    now: input.now,
    timezone: input.timezone,
    failedMessage: SERVICE_FORM_MESSAGES.deleteFailed,
  });
}
