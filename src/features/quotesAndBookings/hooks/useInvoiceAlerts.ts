"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { invoiceAttentionReasons, type InvoiceAttentionReason } from "../utils/invoiceAttention";
import { useQuotesBookingsCapabilities } from "./useQuotesBookingsCapabilities";

type AlertRow = {
  id: string;
  qbo_invoice_id: string | null;
  qbo_invoice_mismatch: number | null;
  qbo_invoice_mismatch_reasons: string | null;
};

const NONE = new Map<string, InvoiceAttentionReason[]>();

/**
 * The quotes whose QuickBooks invoice needs attention, for the counts and marks of the sidebar, the
 * Accountant page and the Quotes & Bookings list. One reactive query on `Events` (no join), and the
 * map and the count come out of the same rows, so a count and the marks it points at cannot disagree.
 *
 * Only an accountant sees them (`seeInvoiceAlerts`): for anyone else the query is built with a
 * condition that matches no row, and the answer is an empty map and 0 whatever the table holds.
 * Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §3
 */
export function useInvoiceAlerts(): {
  /** An event's id to its reasons (spec 09's rule). An event that needs nothing is absent. */
  reasonsByEvent: Map<string, InvoiceAttentionReason[]>;
  count: number;
} {
  const { seeInvoiceAlerts } = useQuotesBookingsCapabilities();

  const compiled = useMemo(() => {
    const query = db
      .selectFrom("Events")
      .select(["id", "qbo_invoice_id", "qbo_invoice_mismatch", "qbo_invoice_mismatch_reasons"]);
    return seeInvoiceAlerts
      ? query
          .where("qbo_invoice_id", "is not", null)
          .where("qbo_invoice_mismatch", "=", 1)
          .where("deleted", "=", 0)
          .compile()
      : query.where(sql<boolean>`0 = 1`).compile();
  }, [seeInvoiceAlerts]);

  const { data } = useTypedQuery(compiled, expect<AlertRow>());

  const reasonsByEvent = useMemo(() => {
    if (!seeInvoiceAlerts || !data) return NONE;
    const byEvent = new Map<string, InvoiceAttentionReason[]>();
    for (const row of data) {
      if (byEvent.has(row.id)) continue;
      const reasons = invoiceAttentionReasons({
        qboInvoiceId: row.qbo_invoice_id,
        mismatch: row.qbo_invoice_mismatch,
        reasons: row.qbo_invoice_mismatch_reasons,
      });
      if (reasons.length > 0) byEvent.set(row.id, reasons);
    }
    return byEvent;
  }, [seeInvoiceAlerts, data]);

  return { reasonsByEvent, count: reasonsByEvent.size };
}
