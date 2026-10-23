import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { readLinkedCustomerId } from "../customers";
import {
  NO_TAX_CODE_MISSING,
  buildInvoicePayload,
  needsNoTaxCode,
  validateInvoiceSource,
} from "./buildInvoicePayload";
import { compareInvoice } from "./compareInvoice";
import { findQboItem } from "./findQboItem";
import type { InvoiceCheck, InvoiceSource } from "./invoiceTypes";
import { readQboInvoice } from "./qboInvoiceApi";
import { resolveNoTaxCode, resolveProvinceTaxCode } from "./resolveProvinceTaxCode";
import { resolveZoneClass } from "./resolveZoneClass";

/**
 * The invoice check: reads the quote's invoice from QuickBooks, works out the invoice the quote would
 * make today from read-only lookups, compares the two field by field and stores the answer on the
 * quote — the flag, its reasons and the time. Server-only: it writes Events with the service role.
 * Spec: docs/specs/qbo-invoice-06-totals-check.md §3
 */

export type InvoiceCheckResult =
  | ({ status: "checked" } & InvoiceCheck)
  /** QuickBooks no longer has the invoice. */
  | { status: "missing" }
  /** The quote cannot be compared right now (deleted, or it fails spec 03's validation). */
  | { status: "skipped"; message: string };

/** QuickBooks could not be reached or its answer could not be read: the database is not to blame. */
export class QboReadError extends Error {}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A check that could not finish leaves the flag, the reasons and the check time as they were and
 * records only when it was tried. It must not hide what went wrong, so a write that fails here is
 * logged and nothing more.
 */
async function recordFailure(eventId: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("Events")
      .update({ qbo_invoice_check_failed_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) console.error("Failed to record the failed invoice check:", error.message);
  } catch (e) {
    console.error("Failed to record the failed invoice check:", messageOf(e));
  }
}

async function skip(eventId: string, message: string): Promise<InvoiceCheckResult> {
  await recordFailure(eventId);
  return { status: "skipped", message };
}

/**
 * Checks the quote's invoice (`source.qboInvoiceId`, in `source.qboInvoiceConnectionId`: the
 * connection it was written in, not the office's current one; every reference is looked up there
 * too). Nothing is created in QuickBooks and no customer is asked for or made. A QuickBooks failure
 * throws a QboReadError; a failure to save the answer is an ordinary Error.
 */
export async function runInvoiceCheck(
  eventId: string,
  source: InvoiceSource,
): Promise<InvoiceCheckResult> {
  const { qboInvoiceId, qboInvoiceConnectionId } = source;
  if (!qboInvoiceId || !qboInvoiceConnectionId) {
    throw new Error("This quote has no QuickBooks invoice to check.");
  }

  const issues = validateInvoiceSource(source);
  if (issues.length > 0) return skip(eventId, issues.map((issue) => issue.message).join(" "));
  // validateInvoiceSource has refused a quote without these.
  const eventTypeName = source.eventTypeName!;
  const billedContact = source.billedContact!;

  let item;
  let invoice;
  try {
    item = await findQboItem(qboInvoiceConnectionId, eventTypeName);
    invoice = await readQboInvoice(qboInvoiceConnectionId, qboInvoiceId);
  } catch (e) {
    await recordFailure(eventId);
    throw new QboReadError(messageOf(e));
  }
  if (!invoice) {
    await recordFailure(eventId);
    return { status: "missing" };
  }
  if (invoice.snapshot.totalCents === null || invoice.snapshot.taxCents === null) {
    await recordFailure(eventId);
    throw new QboReadError("QuickBooks sent an invoice whose total or tax is not an amount.");
  }

  const customerId = await readLinkedCustomerId(qboInvoiceConnectionId, billedContact.id);
  const zoneClass = await resolveZoneClass(qboInvoiceConnectionId, source.venue.state);
  const canadianTaxCodeId =
    source.canadianProvince && source.taxCents > 0
      ? await resolveProvinceTaxCode(qboInvoiceConnectionId, source.canadianProvince)
      : null;
  const noTaxCodeId = source.canadianProvince
    ? await resolveNoTaxCode(qboInvoiceConnectionId)
    : null;
  // QuickBooks Canada refuses any other code on a line with no tax (spec 03d), so the invoice the
  // quote would make cannot be built.
  if (needsNoTaxCode(source, canadianTaxCodeId) && !noTaxCodeId) {
    return skip(eventId, NO_TAX_CODE_MISSING);
  }

  const { body } = buildInvoicePayload(source, {
    item,
    // "" when the contact has no stored link: the comparison then reports the customer.
    customerId: customerId ?? "",
    classId: zoneClass.classId,
    canadianTaxCodeId,
    noTaxCodeId,
  });
  const check = compareInvoice({
    expected: body,
    // The quote's total is the amount after discounts plus the tax (spec 03).
    quote: { totalCents: source.amountCents + source.taxCents, taxCents: source.taxCents },
    actual: invoice.snapshot,
  });

  const { error } = await getSupabaseAdmin()
    .from("Events")
    .update({
      qbo_invoice_mismatch: !check.matches,
      qbo_invoice_mismatch_reasons: check.matches ? null : JSON.stringify(check.reasons),
      qbo_invoice_checked_at: new Date().toISOString(),
      qbo_invoice_check_failed_at: null,
    })
    .eq("id", eventId);
  if (error) throw new Error(`Failed to save the invoice check: ${error.message}`);

  return { status: "checked", ...check };
}
