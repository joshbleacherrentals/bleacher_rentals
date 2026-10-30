"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  invoiceAttentionReasons,
  type InvoiceAttentionReason,
} from "../../../utils/invoiceAttention";

/**
 * Why a quote's QuickBooks invoice needs attention, read from the local row so a check that sets or
 * clears the flag changes the answer without a reload. Empty until the event is in the local database.
 * Spec: docs/specs/qbo-invoice-09-banner.md §4
 */

type AttentionRow = {
  qbo_invoice_id: string | null;
  qbo_invoice_mismatch: number | null;
  qbo_invoice_mismatch_reasons: string | null;
};

export function useInvoiceAttention(eventId: string): InvoiceAttentionReason[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Events")
        .select(["qbo_invoice_id", "qbo_invoice_mismatch", "qbo_invoice_mismatch_reasons"])
        .where("id", "=", eventId)
        .limit(1)
        .compile(),
    [eventId],
  );
  const { data } = useTypedQuery(compiled, expect<AttentionRow>());

  const row = data?.[0];
  if (!row) return [];

  return invoiceAttentionReasons({
    qboInvoiceId: row.qbo_invoice_id,
    mismatch: row.qbo_invoice_mismatch,
    reasons: row.qbo_invoice_mismatch_reasons,
  });
}
