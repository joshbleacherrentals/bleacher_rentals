"use client";

import { INVOICE_REASON_TEXT, type InvoiceAttentionReason } from "../../../utils/invoiceAttention";
import { useInvoiceAttention } from "./useInvoiceAttention";

/**
 * The red notice on the quote card for an accountant: the QuickBooks invoice does not match the
 * quote, one line per difference, and what to press. It follows the stored flag, so it is as fresh as
 * the last check. Spec: docs/specs/qbo-invoice-09-banner.md §4
 */

export function InvoiceAttentionBannerView({ reasons }: { reasons: InvoiceAttentionReason[] }) {
  if (reasons.length === 0) return null;

  return (
    <div role="alert" className="bg-red-50 border border-red-200 px-6 py-3 text-sm text-red-800">
      <p className="font-semibold">The QuickBooks invoice does not match this quote.</p>
      <ul className="mt-1 list-disc pl-5">
        {reasons.map((reason) => (
          <li key={reason}>{INVOICE_REASON_TEXT[reason].long}</li>
        ))}
      </ul>
      <p className="mt-1">
        Press Update invoice on the Billing tab, or correct the invoice in QuickBooks and press
        Check again.
      </p>
    </div>
  );
}

export function InvoiceAttentionBanner({ eventId }: { eventId: string }) {
  return <InvoiceAttentionBannerView reasons={useInvoiceAttention(eventId)} />;
}
