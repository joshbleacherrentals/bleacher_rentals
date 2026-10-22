import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { resolveInvoiceCustomer, type CustomerChoice, type QboCustomerSummary } from "../customers";
import { attachQuotePdf } from "./attachQuotePdf";
import { buildInvoicePayload, needsNoTaxCode, validateInvoiceSource } from "./buildInvoicePayload";
import { findQboItem } from "./findQboItem";
import type { InvoiceBuildWarning } from "./invoiceTypes";
import { loadInvoiceSource } from "./loadInvoiceSource";
import { logInvoiceChange, logIsQboSet } from "./logInvoiceChange";
import { createQboInvoice, findInvoiceByDocNumber, type ExistingInvoice } from "./qboInvoiceApi";
import { resolveNoTaxCode, resolveProvinceTaxCode } from "./resolveProvinceTaxCode";
import { resolveZoneClass, type ClassMissingWarning } from "./resolveZoneClass";

/**
 * Creates the QuickBooks invoice of a booked quote that has none, step by step (the numbered steps
 * are the ones of the spec). A step that fails ends the request with its error and nothing after it
 * runs. Server-only: it writes Events and the Log with the service role.
 * Spec: docs/specs/qbo-invoice-04-create.md §4
 */

export type PdfNotAttachedWarning = { code: "pdf_not_attached"; reason: string };

export type InvoiceWarning = ClassMissingWarning | InvoiceBuildWarning | PdfNotAttachedWarning;

export type CreateInvoiceResult =
  | { status: "created"; docNumber: string; qboInvoiceId: string; warnings: InvoiceWarning[] }
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

const NO_TAX_CODE_MISSING =
  "This QuickBooks connection has no 'no tax' code for Canadian invoices. Ask an admin to choose one on the QuickBooks page.";

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const fail = (httpStatus: ErrorStatus, error: string): CreateInvoiceResult => ({
  status: "error",
  httpStatus,
  error,
});

/** The Item or the customer step failed: a lost token is QuickBooks' side (502), the rest is 400. */
function setupFailure(e: unknown): CreateInvoiceResult {
  const message = messageOf(e);
  return fail(AUTH_ERROR.test(message) ? 502 : 400, message);
}

/** QuickBooks answers the same `requestid` with the invoice it already made; it takes 50 characters. */
function requestIdFor(eventId: string, hash: string | null): string {
  return createHash("sha256")
    .update(`${eventId}:${hash ?? ""}`)
    .digest("hex")
    .slice(0, 50);
}

async function readIsQbo(
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
 * quote ends up with (null when the update changed nothing and nothing is linked).
 */
async function saveInvoiceLink(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  link: { eventId: string; invoiceId: string; connectionId: string; sentHash: string | null },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("Events")
    .update({
      qbo_invoice_id: link.invoiceId,
      qbo_invoice_connection_uuid: link.connectionId,
      qbo_invoice_sent_hash: link.sentHash,
      qbo_invoice_mismatch: false,
      is_qbo: true,
    })
    .eq("id", link.eventId)
    .is("qbo_invoice_id", null)
    .select("id");
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

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const { eventId, customerChoice, userUuid, origin } = params;

  // 1
  const source = await loadInvoiceSource(eventId, origin);
  if (!source) return fail(404, "Quote not found.");
  if (source.qboInvoiceId) return fail(409, "This quote already has a QuickBooks invoice.");

  // 2
  if (source.eventStatus !== "booked") {
    return fail(
      400,
      `A QuickBooks invoice can only be created for a booked quote. This quote's status is "${source.eventStatus ?? "not set"}".`,
    );
  }

  // 3
  const issues = validateInvoiceSource(source);
  if (issues.length > 0) return fail(400, issues.map((issue) => issue.message).join(" "));
  // validateInvoiceSource has refused a quote without these.
  const connectionId = source.connectionId!;
  const eventTypeName = source.eventTypeName!;
  const billedContact = source.billedContact!;
  const docNumber = String(source.invoiceNumber);

  // 4: the hash the invoice will be built from. The loader read it with the quote's data, so a
  // quote edited meanwhile leaves this hash older than the data, which can only read as "outdated".
  const sentHash = source.qboInvoiceHash;

  // 5
  let item;
  try {
    item = await findQboItem(connectionId, eventTypeName);
  } catch (e) {
    return setupFailure(e);
  }

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
    created = await createQboInvoice(connectionId, body, requestIdFor(eventId, sentHash));
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
    connectionId,
    sentHash,
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
  await logInvoiceChange({ eventId, userUuid, kind: "created", docNumber: invoice.docNumber });
  if (!wasQbo) await logIsQboSet({ eventId, userUuid });

  // 11: spec 06 hooks in here (the totals check, which sets qbo_invoice_mismatch).

  // 12: the invoice stays whatever happens to the PDF.
  try {
    await attachQuotePdf(connectionId, invoice.id, eventId);
  } catch (e) {
    warnings.push({ code: "pdf_not_attached", reason: messageOf(e) });
  }

  // 13
  return { status: "created", docNumber: invoice.docNumber, qboInvoiceId: invoice.id, warnings };
}
