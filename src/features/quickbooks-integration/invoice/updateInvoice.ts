import type { CustomerChoice } from "../customers";
import { resolveInvoiceCustomer } from "../customers";
import { replaceQuotePdf } from "./attachQuotePdf";
import {
  NO_TAX_CODE_MISSING,
  buildInvoicePayload,
  needsNoTaxCode,
  validateInvoiceSource,
} from "./buildInvoicePayload";
import {
  bookedRuleFailure,
  checkInvoiceAfterWrite,
  createInvoiceFromSource,
  fail,
  getSupabaseAdmin,
  messageOf,
  readIsQbo,
  saveInvoiceLink,
  setupFailure,
  type CreateInvoiceResult,
  type InvoiceWarning,
} from "./createInvoice";
import { findQboItem } from "./findQboItem";
import type { InvoiceCheck, InvoiceSource, QboItemRef } from "./invoiceTypes";
import { loadInvoiceSource } from "./loadInvoiceSource";
import { logInvoiceChange, logIsQboSet } from "./logInvoiceChange";
import { readQboInvoice, updateQboInvoice, type QboInvoiceVersion } from "./qboInvoiceApi";
import { resolveNoTaxCode, resolveProvinceTaxCode } from "./resolveProvinceTaxCode";
import { resolveZoneClass } from "./resolveZoneClass";

/**
 * Replaces the content of the quote's QuickBooks invoice with the quote's current data (case 1), or
 * links and replaces an invoice found by its number (case 2); a linked invoice QuickBooks no longer
 * has gets a new one (case 3, createInvoiceFromSource). The numbered steps are the ones of the spec.
 * A step that fails ends the request with its error and nothing after it runs. Server-only: it
 * writes Events and the Log with the service role.
 * Spec: docs/specs/qbo-invoice-05-update.md §4, docs/specs/qbo-invoice-06-totals-check.md §5
 */

export type UpdateInvoiceResult =
  | {
      status: "updated";
      docNumber: string;
      qboInvoiceId: string;
      /** True when the update came from an overwrite by number (case 2). */
      linkedExisting: boolean;
      warnings: InvoiceWarning[];
      /** Absent when the check failed itself; the warning says so. */
      check?: InvoiceCheck;
    }
  | { status: "invoice_missing" }
  | CreateInvoiceResult;

type FlowParams = {
  eventId: string;
  customerChoice?: CustomerChoice;
  replaceMissing?: boolean;
  /** `Users.id` of the person who pressed the button (the Log's author). */
  userUuid: string;
  origin: string;
};

export type UpdateInvoiceParams = FlowParams;

export type OverwriteInvoiceParams = FlowParams & {
  /** The QuickBooks invoice found by the quote's number that the user chose to overwrite. */
  overwriteInvoiceId: string;
};

/** The link the quote has to a QuickBooks invoice, or null: the route decides its flow by it. */
export async function readLinkedInvoiceId(eventId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("Events")
    .select("qbo_invoice_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the event: ${error.message}`);
  return data?.qbo_invoice_id ?? null;
}

async function readConnectionNames(ids: string[]): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdmin()
    .from("QboConnections")
    .select("id, display_name")
    .in("id", ids);
  if (error) throw new Error(`Failed to read the QuickBooks connections: ${error.message}`);
  return new Map((data ?? []).map((connection) => [connection.id, connection.display_name]));
}

/**
 * Step 1 (case 1; case 2 when relinking): the invoice must be in the company the quote's office uses
 * now. An office with no connection is left to the validation, which says so.
 */
async function wrongCompanyFailure(source: InvoiceSource): Promise<CreateInvoiceResult | null> {
  if (!source.connectionId || source.qboInvoiceConnectionId === source.connectionId) return null;

  const stored = source.qboInvoiceConnectionId;
  const names = await readConnectionNames(
    stored ? [stored, source.connectionId] : [source.connectionId],
  );
  const oldName = (stored && names.get(stored)) || "unknown";
  const newName = names.get(source.connectionId) ?? "unknown";
  return fail(
    409,
    `This invoice is in the ${oldName} QuickBooks company, but this quote's office now uses ${newName}. Nothing was changed. Fix it by hand in QuickBooks.`,
  );
}

type ReplaceContent = {
  /** The quote, loaded and found valid by the caller. */
  source: InvoiceSource;
  item: QboItemRef;
  /** The invoice to replace, as just read. */
  invoice: QboInvoiceVersion;
  customerChoice?: CustomerChoice;
  userUuid: string;
  /** `update`: the quote's own invoice (case 1). `link`: an invoice found by number (case 2). */
  mode: "update" | "link";
  /** Relinking: the link to the missing invoice that the new link replaces. */
  replacingInvoiceId?: string;
};

/** Steps 6–12 of case 1, which case 2 shares. */
async function replaceInvoiceContent(params: ReplaceContent): Promise<UpdateInvoiceResult> {
  const { source, item, invoice, customerChoice, userUuid, mode, replacingInvoiceId } = params;
  const eventId = source.eventId;
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const billedContact = source.billedContact!;

  // 6
  let resolution;
  try {
    resolution = await resolveInvoiceCustomer(connectionId, billedContact, customerChoice);
  } catch (e) {
    return setupFailure(e);
  }
  if (resolution.kind === "choose") {
    return { status: "choose_customer", candidates: resolution.candidates };
  }

  // 7
  const zoneClass = await resolveZoneClass(connectionId, source.venue.state);
  const canadianTaxCodeId =
    source.canadianProvince && source.taxCents > 0
      ? await resolveProvinceTaxCode(connectionId, source.canadianProvince)
      : null;
  const noTaxCodeId = source.canadianProvince ? await resolveNoTaxCode(connectionId) : null;
  // QuickBooks Canada refuses any other code on a line with no tax (spec 03d).
  if (needsNoTaxCode(source, canadianTaxCodeId) && !noTaxCodeId)
    return fail(400, NO_TAX_CODE_MISSING);
  const { body, warnings: buildWarnings } = buildInvoicePayload(source, {
    item,
    customerId: resolution.customerId,
    classId: zoneClass.classId,
    canadianTaxCodeId,
    noTaxCodeId,
  });
  const warnings: InvoiceWarning[] = [
    ...("warning" in zoneClass ? [zoneClass.warning] : []),
    ...buildWarnings,
  ];

  let updated;
  try {
    updated = await updateQboInvoice(connectionId, invoice, body);
  } catch (e) {
    return fail(502, messageOf(e));
  }
  if (!updated.ok) return fail(502, updated.error);
  const docNumber = updated.invoice.docNumber;

  // 8: an update writes nothing to Events itself (the check of step 10 writes the flag); `is_qbo` is
  // left to the accountant, except when the invoice is first linked.
  let wasQbo = true;
  if (mode === "link") {
    const supabase = getSupabaseAdmin();
    wasQbo = await readIsQbo(supabase, eventId);
    const linkedId = await saveInvoiceLink(supabase, {
      eventId,
      invoiceId: invoice.id,
      connectionId,
      replacingInvoiceId,
    });
    if (linkedId === null) {
      throw new Error("Failed to save the QuickBooks invoice link: the quote was not updated.");
    }
    if (linkedId !== invoice.id) {
      return fail(
        409,
        `Another invoice was linked to this quote while invoice ${docNumber} was being overwritten.`,
      );
    }
  }

  // 9
  await logInvoiceChange({
    eventId,
    userUuid,
    kind: mode === "update" ? "updated" : "linked",
    docNumber,
  });
  if (!wasQbo) await logIsQboSet({ eventId, userUuid });

  // 10: the invoice check, which sets qbo_invoice_mismatch and its reasons (spec 06).
  const { check, warning: checkWarning } = await checkInvoiceAfterWrite(source, {
    invoiceId: invoice.id,
    connectionId,
  });
  if (checkWarning) warnings.push(checkWarning);

  // 11: the invoice stays whatever happens to the PDF.
  try {
    await replaceQuotePdf(connectionId, invoice.id, eventId);
  } catch (e) {
    warnings.push({ code: "pdf_not_attached", reason: messageOf(e) });
  }

  // 12
  return {
    status: "updated",
    docNumber,
    qboInvoiceId: invoice.id,
    linkedExisting: mode === "link",
    warnings,
    ...(check ? { check } : {}),
  };
}

/** Case 1: the quote has an invoice; case 3 when it is gone from QuickBooks and the user said so. */
export async function updateInvoice(params: UpdateInvoiceParams): Promise<UpdateInvoiceResult> {
  const { eventId, customerChoice, replaceMissing, userUuid, origin } = params;

  // 1
  const source = await loadInvoiceSource(eventId, origin);
  if (!source) return fail(404, "Quote not found.");
  const linkedInvoiceId = source.qboInvoiceId;
  if (!linkedInvoiceId) return fail(409, "This quote has no QuickBooks invoice to update.");
  const moved = await wrongCompanyFailure(source);
  if (moved) return moved;

  // 2: the booked rule is not applied.
  const issues = validateInvoiceSource(source);
  if (issues.length > 0) return fail(400, issues.map((issue) => issue.message).join(" "));
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const eventTypeName = source.eventTypeName!;

  // 3: removed with the hash (spec 05, 2026-10-23).

  // 4
  let item;
  try {
    item = await findQboItem(connectionId, eventTypeName);
  } catch (e) {
    return setupFailure(e);
  }

  // 5
  let invoice: QboInvoiceVersion | null;
  try {
    invoice = await readQboInvoice(connectionId, linkedInvoiceId);
  } catch (e) {
    return fail(502, messageOf(e));
  }
  if (!invoice) {
    if (!replaceMissing) return { status: "invoice_missing" };
    // Case 3.
    return createInvoiceFromSource({
      source,
      item,
      customerChoice,
      userUuid,
      replacingInvoiceId: linkedInvoiceId,
    });
  }

  return replaceInvoiceContent({
    source,
    item,
    invoice,
    customerChoice,
    userUuid,
    mode: "update",
  });
}

/**
 * Case 2: the quote has no invoice (or a link to a missing one, with `replaceMissing`) and the user
 * chose to overwrite the invoice that has the quote's number.
 */
export async function overwriteInvoice(
  params: OverwriteInvoiceParams,
): Promise<UpdateInvoiceResult> {
  const { eventId, customerChoice, replaceMissing, overwriteInvoiceId, userUuid, origin } = params;

  // 1
  const source = await loadInvoiceSource(eventId, origin);
  if (!source) return fail(404, "Quote not found.");
  const relinkingId = replaceMissing ? source.qboInvoiceId : null;
  if (source.qboInvoiceId && !relinkingId) {
    return fail(409, "This quote already has a QuickBooks invoice.");
  }
  if (relinkingId) {
    const moved = await wrongCompanyFailure(source);
    if (moved) return moved;
  }

  // 2: a first link needs a booked quote; relinking is a quote that already had an invoice.
  if (!relinkingId) {
    const notBooked = bookedRuleFailure(source);
    if (notBooked) return notBooked;
  }

  // 3
  const issues = validateInvoiceSource(source);
  if (issues.length > 0) return fail(400, issues.map((issue) => issue.message).join(" "));
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const eventTypeName = source.eventTypeName!;

  // 4
  let item;
  try {
    item = await findQboItem(connectionId, eventTypeName);
  } catch (e) {
    return setupFailure(e);
  }

  // 5: the invoice must exist in this connection's file and carry the quote's number.
  let invoice: QboInvoiceVersion | null;
  try {
    invoice = await readQboInvoice(connectionId, overwriteInvoiceId);
  } catch (e) {
    return fail(502, messageOf(e));
  }
  if (!invoice) {
    return fail(
      400,
      `QuickBooks has no invoice with the id ${overwriteInvoiceId} in this company.`,
    );
  }
  const quoteNumber = String(source.invoiceNumber);
  if (invoice.docNumber !== quoteNumber) {
    return fail(
      400,
      `QuickBooks invoice ${invoice.docNumber} does not have this quote's invoice number (${quoteNumber}), so it cannot be overwritten.`,
    );
  }

  return replaceInvoiceContent({
    source,
    item,
    invoice,
    customerChoice,
    userUuid,
    mode: "link",
    replacingInvoiceId: relinkingId ?? undefined,
  });
}
