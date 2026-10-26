"use client";

import { INVOICE_REASON_TEXT, type InvoiceAttentionReason } from "../utils/invoiceAttention";

/**
 * The per-row counterpart of the red counts: a dot on the one row of a list that the count is about,
 * with what differs on hover — the short text of each reason, spec 09's words. Draws nothing for a
 * quote that needs nothing.
 * Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §4
 */
export function InvoiceAttentionMark({
  reasons,
}: {
  reasons: InvoiceAttentionReason[] | undefined;
}) {
  if (!reasons || reasons.length === 0) return null;
  const label = reasons.map((reason) => INVOICE_REASON_TEXT[reason].short).join(", ");
  return (
    <span
      data-testid="invoice-attention-mark"
      role="img"
      aria-label={label}
      title={label}
      className="inline-block size-2.5 shrink-0 rounded-full bg-red-600"
    />
  );
}
