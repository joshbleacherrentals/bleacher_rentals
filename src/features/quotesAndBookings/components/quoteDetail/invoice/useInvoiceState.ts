"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

/**
 * What the Create / Update buttons need to know about one quote: whether it has a QuickBooks
 * invoice, and whether it may get one. Spec: docs/specs/qbo-invoice-07-card-buttons.md §4
 */

type InvoiceRow = { event_status: string | null; qbo_invoice_id: string | null };

/**
 * The invoice number of the last `created`/`updated` answer counts as "has an invoice" before the
 * link reaches the local database: sync lags, and a Create button that waited for it would be
 * pressed twice and meet a 409.
 */
export function deriveInvoiceState(input: {
  status: string | null;
  invoiceId: string | null;
  rememberedNumber: string | null;
}) {
  const hasInvoice = Boolean(input.invoiceId) || input.rememberedNumber !== null;
  return { hasInvoice, canCreate: input.status === "booked" && !hasInvoice };
}

export function useInvoiceState(eventId: string) {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Events")
        .select(["event_status", "qbo_invoice_id"])
        .where("id", "=", eventId)
        .limit(1)
        .compile(),
    [eventId],
  );
  const { data } = useTypedQuery(compiled, expect<InvoiceRow>());
  const [rememberedNumber, rememberInvoice] = useState<string | null>(null);

  const row = data?.[0];
  const invoiceId = row?.qbo_invoice_id ?? null;

  // Once sync shows the link, the button follows the synced value alone.
  useEffect(() => {
    if (invoiceId) rememberInvoice(null);
  }, [invoiceId]);

  return {
    ...deriveInvoiceState({ status: row?.event_status ?? null, invoiceId, rememberedNumber }),
    rememberInvoice,
  };
}
