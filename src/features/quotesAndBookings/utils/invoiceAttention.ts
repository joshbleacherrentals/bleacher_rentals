import {
  INVOICE_REASONS,
  INVOICE_REASON_SHORT_TEXT,
  type InvoiceReason,
} from "@/features/quickbooks-integration/invoice/invoiceTypes";

/**
 * When a quote's QuickBooks invoice needs an accountant's attention, and why. One function, so the
 * banner on the card and the lists of specs 10 and 11 cannot disagree.
 * Spec: docs/specs/qbo-invoice-09-banner.md §3
 */

/** The three columns of the event, as the local database gives them. */
export type InvoiceAttentionInput = {
  qboInvoiceId: string | null;
  /** Stored as 0/1 locally; the server writes a boolean. */
  mismatch: number | boolean | null;
  /** The stored JSON array of reason codes, or null (spec 01). */
  reasons: string | null;
};

/** One of spec 06's codes, or the generic one for a set flag the reasons do not explain. */
export type InvoiceAttentionReason = InvoiceReason | "unspecified";

/**
 * The reasons, in spec 06's order and without repeats. Empty unless the quote has an invoice and the
 * last check found a difference; a set flag with no usable reasons (an empty column, a column holding
 * only codes this version does not know) is `["unspecified"]`.
 */
export function invoiceAttentionReasons(input: InvoiceAttentionInput): InvoiceAttentionReason[] {
  if (!input.qboInvoiceId) return [];
  if (!input.mismatch) return [];

  const stored = new Set(parseStoredReasons(input.reasons));
  const known = INVOICE_REASONS.filter((reason) => stored.has(reason));
  return known.length > 0 ? known : ["unspecified"];
}

function parseStoredReasons(text: string | null): unknown[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Each reason's words: a short text for lists and marks, and a long one for the banner.
 * One place, so no surface words a reason differently.
 */
export const INVOICE_REASON_TEXT: Record<InvoiceAttentionReason, { short: string; long: string }> =
  {
    number: {
      short: INVOICE_REASON_SHORT_TEXT.number,
      long: "The invoice number in QuickBooks is not this quote's invoice number.",
    },
    dates: {
      short: INVOICE_REASON_SHORT_TEXT.dates,
      long: "The invoice date or the due date in QuickBooks does not match this quote.",
    },
    customer: {
      short: INVOICE_REASON_SHORT_TEXT.customer,
      long: "The customer or the Bill to name in QuickBooks does not match this quote's client.",
    },
    address: {
      short: INVOICE_REASON_SHORT_TEXT.address,
      long: "The Location of Sale in QuickBooks does not match this quote's venue address.",
    },
    memo: {
      short: INVOICE_REASON_SHORT_TEXT.memo,
      long: "The memo on the QuickBooks invoice does not match this quote's title.",
    },
    lines: {
      short: INVOICE_REASON_SHORT_TEXT.lines,
      long: "The QuickBooks invoice does not have exactly one line.",
    },
    service: {
      short: INVOICE_REASON_SHORT_TEXT.service,
      long: "The service (event type) or its description on the QuickBooks invoice does not match this quote.",
    },
    amount: {
      short: INVOICE_REASON_SHORT_TEXT.amount,
      long: "The amount on the QuickBooks invoice does not match this quote.",
    },
    tax_code: {
      short: INVOICE_REASON_SHORT_TEXT.tax_code,
      long: "The tax code on the QuickBooks invoice is not the one set for this quote.",
    },
    class: {
      short: INVOICE_REASON_SHORT_TEXT.class,
      long: "The Class on the QuickBooks invoice does not match this quote's zone.",
    },
    totals: {
      short: INVOICE_REASON_SHORT_TEXT.totals,
      long: "QuickBooks' total or tax does not match this quote's.",
    },
    unspecified: {
      short: "Invoice does not match the quote",
      long: "The QuickBooks invoice does not match this quote.",
    },
  };
