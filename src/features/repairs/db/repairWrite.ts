import React from "react";
import { sql, type CompiledQuery } from "kysely";
import { toast } from "sonner";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import {
  REPAIR_EVENT_NAME,
  REPAIR_FORM_MESSAGES,
  changedRepairFields,
  invoiceNumberKey,
  normalizeInvoiceNumber,
  normalizeNotes,
  validateRepairForm,
  type RepairFormErrors,
  type RepairFormValues,
} from "../utils/repairForm";
import type { ReportedReport } from "../utils/repairRows";
import { checkedBleachersOfDraft } from "../utils/repairLinks";
import { isServicesDraftChanged, type ServicesDraft } from "../utils/serviceForm";
import { writeRepairChanges } from "./repairLinkWrite";
import { buildStatusStatements } from "./repairStatusWrite";
import { buildServicesDraftStatements } from "./serviceWrite";
import { buildVendorAddressQuery, type RawVendorAddressRow } from "./repairWindowQueries";

/**
 * The writes of a repair itself: Add repair, Save of an Edit, Delete and Restore. Local-first,
 * through the app's Kysely and one local transaction per action (docs/POWERSYNC_ARCHITECTURE.md).
 * The statements are built apart from the run so that they are tested on SQLite, and the writers
 * validate before they write. docs/specs/repairs-09a-repair-writes.md §2.4 to §2.6 and §3 (D125 to
 * D145; the signatures here are locked by that spec). The services draft of New repair and Edit rides
 * in the same batch, after the repair's own statements: docs/specs/repairs-09b1-services.md §2.6 and §3
 * (D149, D161). When the draft changes services, the write goes through `writeRepairChanges`, which
 * also keeps the repair's junction, zone and damage report links in step in the same local
 * transaction: docs/specs/repairs-09b2-bleachers-zone-reports.md §2.3 and §3 (D176, D184, D186).
 */

export type CreateRepairInput = {
  id: string; // a new uuid, chosen by the caller
  values: RepairFormValues;
  createdByUserUuid: string | null;
  now: string; // an ISO timestamp: created_at, and completed_at for a Completed repair
  /** The services of the New repair window (09b1 D149); absent is an empty draft. */
  services?: ServicesDraft;
  /** The app time zone, for the day of a damage report (09b2 D185). */
  timezone: string;
};

/**
 * The insert of §2.5. It never writes `cost_cents`, `zone_uuid` or `address_uuid` (D125, D132), and
 * leaves the owner out when the user's id is not known yet, so the database default fills it.
 */
export function buildCreateRepairStatement(input: CreateRepairInput): CompiledQuery {
  const { id, values, createdByUserUuid, now } = input;
  return db
    .insertInto("MaintenanceEvents")
    .values({
      id,
      event_name: REPAIR_EVENT_NAME,
      event_start: values.eventStart,
      event_end: values.eventEnd,
      vendor_uuid: values.vendorUuid,
      invoice_number: normalizeInvoiceNumber(values.invoiceNumber),
      status: values.status,
      currency: values.currency,
      notes: normalizeNotes(values.notes),
      completed_at: values.status === "completed" ? now : null,
      ...(createdByUserUuid ? { created_by_user_uuid: createdByUserUuid } : {}),
      created_at: now,
      deleted: 0,
    })
    .compile();
}

export type UpdateRepairInput = {
  repairId: string;
  initial: RepairFormValues;
  values: RepairFormValues;
  liveStatus: string; // the status the list shows at Save (the `from` of spec 08)
  reported: readonly ReportedReport[];
  now: string;
  /** The services draft of the Edit window (09b1 D161); absent is an empty draft. */
  services?: ServicesDraft;
  /** The app time zone, for the day of a damage report (09b2 D185). */
  timezone: string;
};

/**
 * The statements of §2.5 for an Edit, in order: one update of the changed columns (never `status`),
 * then the statements of spec 08 when the person picked another status, then the statements of the
 * services draft (09b1). Empty when nothing is to be written.
 */
export function buildUpdateRepairStatements(input: UpdateRepairInput): CompiledQuery[] {
  const { repairId, initial, values } = input;
  const changed = changedRepairFields(initial, values);
  const statements: CompiledQuery[] = [];

  const columns: Record<string, string | null> = {};
  for (const field of changed) {
    switch (field) {
      case "vendorUuid":
        columns.vendor_uuid = values.vendorUuid;
        break;
      case "invoiceNumber":
        columns.invoice_number = normalizeInvoiceNumber(values.invoiceNumber);
        break;
      case "currency":
        columns.currency = values.currency;
        break;
      case "eventStart":
        columns.event_start = values.eventStart;
        break;
      case "eventEnd":
        columns.event_end = values.eventEnd;
        break;
      case "notes":
        columns.notes = normalizeNotes(values.notes);
        break;
      case "status":
        break; // written by the statements of spec 08 below
    }
  }
  if (Object.keys(columns).length > 0) {
    statements.push(
      db.updateTable("MaintenanceEvents").set(columns).where("id", "=", repairId).compile(),
    );
  }

  if (changed.includes("status")) {
    statements.push(
      ...buildStatusStatements({
        repairId,
        from: input.liveStatus,
        to: values.status,
        reported: input.reported,
        now: input.now,
      }),
    );
  }

  statements.push(
    ...buildServicesDraftStatements({
      repairId,
      draft: input.services ?? [],
      now: input.now,
    }),
  );
  return statements;
}

/** `deleted` = 1 or 0 on one repair. */
export function buildSetDeletedStatement(repairId: string, deleted: boolean): CompiledQuery {
  return db
    .updateTable("MaintenanceEvents")
    .set({ deleted: deleted ? 1 : 0 })
    .where("id", "=", repairId)
    .compile();
}

export type InvoiceDuplicateQuery = {
  vendorUuid: string | null;
  invoiceNumber: string | null;
  excludeRepairId: string | null;
};

/**
 * The read of D137: a live repair of the same vendor whose invoice number has the same key (spaces
 * at the ends and the case do not count). Null when there is no vendor or no number (nothing to
 * compare). The repair itself and the deleted repairs are left out.
 */
export function buildInvoiceDuplicateQuery(
  query: InvoiceDuplicateQuery,
): CompiledQuery<{ id: string }> | null {
  const key = invoiceNumberKey(query.invoiceNumber);
  if (!query.vendorUuid || key === null) return null;
  return db
    .selectFrom("MaintenanceEvents")
    .select(["id as id"])
    .where("vendor_uuid", "=", query.vendorUuid)
    .where(sql<string>`lower(trim(invoice_number))`, "=", key)
    .where("deleted", "=", 0)
    .$if(query.excludeRepairId !== null, (qb) =>
      qb.where("id", "<>", query.excludeRepairId as string),
    )
    .limit(1)
    .compile() as CompiledQuery<{ id: string }>;
}

/** Runs it with `typedGetAll`: true when a live repair has the same vendor and number. */
export async function findInvoiceDuplicate(query: InvoiceDuplicateQuery): Promise<boolean> {
  const compiled = buildInvoiceDuplicateQuery(query);
  if (!compiled) return false;
  const rows = await typedGetAll(compiled, expect<{ id: string }>());
  return rows.length > 0;
}

/** The vendor's country (`Addresses.country`) for D133, or null; one local read. */
export async function readVendorCountry(vendorUuid: string): Promise<string | null> {
  const rows = await typedGetAll(
    buildVendorAddressQuery(vendorUuid),
    expect<RawVendorAddressRow>(),
  );
  return rows[0]?.country ?? null;
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

/** One batch; a failure shows the message with the error text and is thrown again (D139). */
async function writeBatch(statements: CompiledQuery[], message: string): Promise<void> {
  try {
    await typedExecuteBatch(statements);
  } catch (e) {
    showErrorToast([message, String(e)]);
    throw e;
  }
}

/**
 * Validates (`validateRepairForm`, then the duplicate check), writes in one `typedExecuteBatch`, and
 * returns null when written or the errors when nothing was written. A write error shows an
 * `ErrorToast` (`saveFailed` and the error text) and is thrown again.
 */
export async function createRepair(
  input: Omit<CreateRepairInput, "id"> & { id?: string },
): Promise<RepairFormErrors | null> {
  const errors = validateRepairForm(input.values);
  const duplicate = await findInvoiceDuplicate({
    vendorUuid: input.values.vendorUuid,
    invoiceNumber: input.values.invoiceNumber,
    excludeRepairId: null,
  });
  if (duplicate) errors.invoiceNumber = REPAIR_FORM_MESSAGES.invoiceDuplicate;
  if (Object.keys(errors).length > 0) return errors;

  // The page may make the id itself, so that the files can be written for it afterwards (09b3).
  const id = input.id ?? crypto.randomUUID();
  const draft = input.services ?? [];
  const statements = [
    buildCreateRepairStatement({ ...input, id }),
    ...buildServicesDraftStatements({ repairId: id, draft, now: input.now }),
  ];
  if (!isServicesDraftChanged(draft)) {
    await writeBatch(statements, REPAIR_FORM_MESSAGES.saveFailed);
    return null;
  }
  const refusal = await writeRepairChanges({
    repairId: id,
    statements,
    servicesAffected: true,
    checkedBleacherUuids: checkedBleachersOfDraft(draft),
    now: input.now,
    timezone: input.timezone,
    failedMessage: REPAIR_FORM_MESSAGES.saveFailed,
  });
  return refusal ? { services: refusal.message } : null;
}

/**
 * The same for an Edit. Nothing changed (no field and no service): nothing is checked and nothing is
 * written. The duplicate
 * check runs only when the vendor or the number changed, so a record that was already a
 * near-duplicate does not block an unrelated edit (§2.4).
 */
export async function updateRepair(input: UpdateRepairInput): Promise<RepairFormErrors | null> {
  const changed = changedRepairFields(input.initial, input.values);
  if (changed.length === 0 && !isServicesDraftChanged(input.services ?? [])) return null;

  const errors = validateRepairForm(input.values);
  if (changed.includes("vendorUuid") || changed.includes("invoiceNumber")) {
    const duplicate = await findInvoiceDuplicate({
      vendorUuid: input.values.vendorUuid,
      invoiceNumber: input.values.invoiceNumber,
      excludeRepairId: input.repairId,
    });
    if (duplicate) errors.invoiceNumber = REPAIR_FORM_MESSAGES.invoiceDuplicate;
  }
  if (Object.keys(errors).length > 0) return errors;

  const statements = buildUpdateRepairStatements(input);
  if (statements.length === 0) return null;
  const draft = input.services ?? [];
  if (!isServicesDraftChanged(draft)) {
    await writeBatch(statements, REPAIR_FORM_MESSAGES.saveFailed);
    return null;
  }
  const refusal = await writeRepairChanges({
    repairId: input.repairId,
    statements,
    servicesAffected: true,
    checkedBleacherUuids: checkedBleachersOfDraft(draft),
    now: input.now,
    timezone: input.timezone,
    failedMessage: REPAIR_FORM_MESSAGES.saveFailed,
  });
  return refusal ? { services: refusal.message } : null;
}

/** One update; a write error shows `deleteFailed` with the error text and is thrown again. */
export async function deleteRepair(repairId: string): Promise<void> {
  await writeBatch([buildSetDeletedStatement(repairId, true)], REPAIR_FORM_MESSAGES.deleteFailed);
}

/**
 * The duplicate check, then one update. "duplicate": the red toast of D145 was shown and nothing was
 * written. A write error shows `restoreFailed` with the error text and is thrown again.
 */
export async function restoreRepair(input: {
  repairId: string;
  vendorUuid: string | null;
  invoiceNumber: string | null;
}): Promise<"restored" | "duplicate"> {
  const duplicate = await findInvoiceDuplicate({
    vendorUuid: input.vendorUuid,
    invoiceNumber: input.invoiceNumber,
    excludeRepairId: input.repairId,
  });
  if (duplicate) {
    showErrorToast([REPAIR_FORM_MESSAGES.restoreDuplicate]);
    return "duplicate";
  }
  await writeBatch(
    [buildSetDeletedStatement(input.repairId, false)],
    REPAIR_FORM_MESSAGES.restoreFailed,
  );
  return "restored";
}
