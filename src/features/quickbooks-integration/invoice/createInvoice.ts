import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { resolveInvoiceCustomer, type CustomerChoice, type QboCustomerSummary } from "../customers";
import { attachQuotePdf } from "./attachQuotePdf";
import {
  NO_TAX_CODE_MISSING,
  buildInvoicePayload,
  needsNoTaxCode,
  validateInvoiceSource,
} from "./buildInvoicePayload";
import { runInvoiceCheck } from "./checkInvoice";
import { findQboItem } from "./findQboItem";
import type { InvoiceBuildWarning, InvoiceCheck, InvoiceSource, QboItemRef } from "./invoiceTypes";
import { loadInvoiceSource } from "./loadInvoiceSource";
import { logInvoiceChange, logIsQboSet } from "./logInvoiceChange";
import { createQboInvoice, findInvoiceByDocNumber, type ExistingInvoice } from "./qboInvoiceApi";
import { resolveNoTaxCode, resolveProvinceTaxCode } from "./resolveProvinceTaxCode";
import { resolveZoneClass, type ClassMissingWarning } from "./resolveZoneClass";

/**
 * Creates the QuickBooks invoice of a booked quote that has none, step by step (the numbered steps
 * are the ones of the spec). A step that fails ends the request with its error and nothing after it
 * runs. Server-only: it writes Events and the Log with the service role.
 * Steps 6–13 are also case 3 of the update route: a quote whose linked invoice QuickBooks no longer
 * has gets a new one (createInvoiceFromSource, `replacingInvoiceId`).
 * Spec: docs/specs/qbo-invoice-04-create.md §4, docs/specs/qbo-invoice-05-update.md §4,
 * docs/specs/qbo-invoice-06-totals-check.md §5
 */

export type PdfNotAttachedWarning = { code: "pdf_not_attached"; reason: string };

export type InvoiceCheckFailedWarning = { code: "invoice_check_failed"; reason: string };

export type InvoiceWarning =
  | ClassMissingWarning
  | InvoiceBuildWarning
  | InvoiceCheckFailedWarning
  | PdfNotAttachedWarning;

export type CreateInvoiceResult =
  | {
      status: "created";
      docNumber: string;
      qboInvoiceId: string;
      warnings: InvoiceWarning[];
      /** Absent when the check failed itself; the warning says so. */
      check?: InvoiceCheck;
    }
  | { status: "choose_customer"; candidates: QboCustomerSummary[] }
  | { status: "invoice_number_exists"; invoice: ExistingInvoice }
  | { status: "error"; httpStatus: 400 | 404 | 409 | 502; error: string };

export type CreateInvoiceParams = {
  eventId: string;
  customerChoice?: CustomerChoice;
  /** `Users.id` of the person who pressed the button (the Log's author). */
  userUuid: string;
  origin: string;
};

type ErrorStatus = Extract<CreateInvoiceResult, { status: "error" }>["httpStatus"];

// What getQboAccessTokenAndRealmId and describeQboAuthError throw when the connection lost its token.
const AUTH_ERROR = /re-authenticate|No tokens found/i;

// The refusal message lives with the builder, which the invoice check needs too.
export { NO_TAX_CODE_MISSING };

export function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const fail = (httpStatus: ErrorStatus, error: string): CreateInvoiceResult => ({
  status: "error",
  httpStatus,
  error,
});

/** The Item or the customer step failed: a lost token is QuickBooks' side (502), the rest is 400. */
export function setupFailure(e: unknown): CreateInvoiceResult {
  const message = messageOf(e);
  return fail(AUTH_ERROR.test(message) ? 502 : 400, message);
}

/**
 * QuickBooks answers the same `requestid` with the invoice it already made; it takes 50 characters.
 * It is made from the event alone — no hash of the quote's data (spec 04 §2). A quote made again
 * carries the old invoice's id too: the same event made the deleted one.
 */
function requestIdFor(eventId: string, replacingInvoiceId?: string): string {
  return createHash("sha256")
    .update(`${eventId}${replacingInvoiceId ? `:replaces:${replacingInvoiceId}` : ""}`)
    .digest("hex")
    .slice(0, 50);
}

export async function readIsQbo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("Events")
    .select("is_qbo")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the event: ${error.message}`);
  return data?.is_qbo ?? false;
}

/**
 * Step 9. Links the invoice unless another request linked one first; returns the invoice id the
 * quote ends up with (null when the update changed nothing and nothing is linked). A quote that had
 * a link to a missing invoice (`replacingInvoiceId`) is guarded by that id instead of by no link.
 */
export async function saveInvoiceLink(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  link: {
    eventId: string;
    invoiceId: string;
    replacingInvoiceId?: string;
  },
): Promise<string | null> {
  const update = supabase
    .from("Events")
    .update({
      qbo_invoice_id: link.invoiceId,
      qbo_invoice_mismatch: false,
      qbo_invoice_mismatch_reasons: null,
      qbo_invoice_checked_at: null,
      qbo_invoice_check_failed_at: null,
      is_qbo: true,
    })
    .eq("id", link.eventId);
  const { data, error } = await (
    link.replacingInvoiceId
      ? update.eq("qbo_invoice_id", link.replacingInvoiceId)
      : update.is("qbo_invoice_id", null)
  ).select("id");
  if (error) throw new Error(`Failed to save the QuickBooks invoice link: ${error.message}`);
  if (data && data.length > 0) return link.invoiceId;

  const { data: row, error: readError } = await supabase
    .from("Events")
    .select("qbo_invoice_id")
    .eq("id", link.eventId)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read the event: ${readError.message}`);
  return row?.qbo_invoice_id ?? null;
}

/**
 * Step 11 of create, step 10 of update: compares the invoice just written with the quote and stores
 * the answer (spec 06). The invoice just linked is the one checked, in the sales office's connection.
 * A check that cannot finish does not fail the request: it becomes the `invoice_check_failed`
 * warning, and the stored flag stays as it was.
 */
export async function checkInvoiceAfterWrite(
  source: InvoiceSource,
  link: { invoiceId: string },
): Promise<{ check?: InvoiceCheck; warning?: InvoiceCheckFailedWarning }> {
  try {
    const result = await runInvoiceCheck(source.eventId, {
      ...source,
      qboInvoiceId: link.invoiceId,
    });
    if (result.status === "missing") {
      return {
        warning: {
          code: "invoice_check_failed",
          reason: "QuickBooks did not return the invoice that was just written.",
        },
      };
    }
    if (result.status === "skipped") {
      return { warning: { code: "invoice_check_failed", reason: result.message } };
    }
    return {
      check: {
        matches: result.matches,
        reasons: result.reasons,
        differences: result.differences,
      },
    };
  } catch (e) {
    return { warning: { code: "invoice_check_failed", reason: messageOf(e) } };
  }
}

/** Step 2, also the booked rule of case 2 of spec 05: only a booked quote gets its first invoice. */
export function bookedRuleFailure(source: InvoiceSource): CreateInvoiceResult | null {
  if (source.eventStatus === "booked") return null;
  return fail(
    400,
    `A QuickBooks invoice can only be created for a booked quote. This quote's status is "${source.eventStatus ?? "not set"}".`,
  );
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const { eventId, customerChoice, userUuid, origin } = params;

  // 1
  const source = await loadInvoiceSource(eventId, origin);
  if (!source) return fail(404, "Quote not found.");
  if (source.qboInvoiceId) return fail(409, "This quote already has a QuickBooks invoice.");

  // 2
  const notBooked = bookedRuleFailure(source);
  if (notBooked) return notBooked;

  // 3
  const issues = validateInvoiceSource(source);
  if (issues.length > 0) return fail(400, issues.map((issue) => issue.message).join(" "));
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const eventTypeName = source.eventTypeName!;

  // 4: removed with the hash (spec 04, 2026-10-23).

  // 5
  let item;
  try {
    item = await findQboItem(connectionId, eventTypeName);
  } catch (e) {
    return setupFailure(e);
  }

  return createInvoiceFromSource({ source, item, customerChoice, userUuid });
}

export type CreateFromSourceParams = {
  /** A quote the caller has loaded and found valid. */
  source: InvoiceSource;
  item: QboItemRef;
  customerChoice?: CustomerChoice;
  /** `Users.id` of the person who pressed the button (the Log's author). */
  userUuid: string;
  /** Case 3 of spec 05: the id of the linked invoice QuickBooks no longer has; the new link replaces it. */
  replacingInvoiceId?: string;
};

/** Steps 6–13: from the number check on, for a quote the caller has already checked (steps 1–5). */
export async function createInvoiceFromSource(
  params: CreateFromSourceParams,
): Promise<CreateInvoiceResult> {
  const { source, item, customerChoice, userUuid, replacingInvoiceId } = params;
  const eventId = source.eventId;
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const billedContact = source.billedContact!;
  const docNumber = String(source.invoiceNumber);

  // 6
  let existing: ExistingInvoice | null;
  try {
    existing = await findInvoiceByDocNumber(connectionId, docNumber);
  } catch (e) {
    return fail(502, messageOf(e));
  }
  if (existing) return { status: "invoice_number_exists", invoice: existing };

  // 7
  let resolution;
  try {
    resolution = await resolveInvoiceCustomer(connectionId, billedContact, customerChoice);
  } catch (e) {
    return setupFailure(e);
  }
  if (resolution.kind === "choose") {
    return { status: "choose_customer", candidates: resolution.candidates };
  }

  // 8
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

  let created;
  try {
    created = await createQboInvoice(connectionId, body, requestIdFor(eventId, replacingInvoiceId));
  } catch (e) {
    return fail(502, messageOf(e));
  }
  if (!created.ok) return fail(502, created.error);
  const { invoice } = created;

  // 9: before the PDF, so that a timeout can never leave an invoice nobody knows about.
  const supabase = getSupabaseAdmin();
  const wasQbo = await readIsQbo(supabase, eventId);
  const linkedId = await saveInvoiceLink(supabase, {
    eventId,
    invoiceId: invoice.id,
    replacingInvoiceId,
  });
  if (linkedId === null) {
    throw new Error("Failed to save the QuickBooks invoice link: the quote was not updated.");
  }
  if (linkedId !== invoice.id) {
    return fail(
      409,
      `Another invoice was linked to this quote while this one was being made. The extra invoice ${invoice.docNumber} is in QuickBooks; delete it there.`,
    );
  }

  // 10
  await logInvoiceChange({
    eventId,
    userUuid,
    kind: replacingInvoiceId ? "recreated" : "created",
    docNumber: invoice.docNumber,
  });
  if (!wasQbo) await logIsQboSet({ eventId, userUuid });

  // 11: the invoice check, which sets qbo_invoice_mismatch and its reasons (spec 06).
  const { check, warning: checkWarning } = await checkInvoiceAfterWrite(source, {
    invoiceId: invoice.id,
  });
  if (checkWarning) warnings.push(checkWarning);

  // 12: the invoice stays whatever happens to the PDF.
  try {
    await attachQuotePdf(connectionId, invoice.id, eventId);
  } catch (e) {
    warnings.push({ code: "pdf_not_attached", reason: messageOf(e) });
  }

  // 13
  return {
    status: "created",
    docNumber: invoice.docNumber,
    qboInvoiceId: invoice.id,
    warnings,
    ...(check ? { check } : {}),
  };
}
