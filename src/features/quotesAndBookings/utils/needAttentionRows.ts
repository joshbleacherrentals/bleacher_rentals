import type { QuotesBookingsEvent } from "../types";
import { invoiceAttentionReasons, type InvoiceAttentionReason } from "./invoiceAttention";

/**
 * The rows of the Need attention tab: the page's events whose QuickBooks invoice needs attention,
 * each with the reasons. The rule is spec 09's `invoiceAttentionReasons`, so the tab, the banner and
 * the counts cannot disagree.
 * Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §3
 */

/** The invoice columns of an event, as the local database gives them (spec 01). */
export type NeedAttentionRow = {
  id: string;
  qbo_invoice_id: string | null;
  qbo_invoice_mismatch: number | null;
  qbo_invoice_mismatch_reasons: string | null;
};

export type NeedAttentionEvent = QuotesBookingsEvent & { reasons: InvoiceAttentionReason[] };

/**
 * The events of the page that need attention, in the order of `events`. An event the page does not
 * hold (filtered out, or deleted while Show Deleted is off) is not in the result.
 */
export function needAttentionRows(
  events: QuotesBookingsEvent[],
  attentionRows: NeedAttentionRow[],
): NeedAttentionEvent[] {
  const reasonsById = new Map<string, InvoiceAttentionReason[]>();
  for (const row of attentionRows) {
    if (reasonsById.has(row.id)) continue;
    const reasons = invoiceAttentionReasons({
      qboInvoiceId: row.qbo_invoice_id,
      mismatch: row.qbo_invoice_mismatch,
      reasons: row.qbo_invoice_mismatch_reasons,
    });
    if (reasons.length > 0) reasonsById.set(row.id, reasons);
  }

  return events.flatMap((event) => {
    const reasons = reasonsById.get(event.id);
    return reasons ? [{ ...event, reasons }] : [];
  });
}
