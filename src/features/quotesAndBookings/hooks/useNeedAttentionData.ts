"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { NeedAttentionRow } from "../utils/needAttentionRows";

/**
 * The invoice columns of every event that has a QuickBooks invoice whose last check found a
 * difference. The event rows themselves come from the page's own query (`useQuotesAndBookingsData`);
 * `needAttentionRows` joins the two, so this reads one table and has no join.
 * Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §3
 */
export function useNeedAttentionData() {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Events")
        .select(["id", "qbo_invoice_id", "qbo_invoice_mismatch", "qbo_invoice_mismatch_reasons"])
        .where("qbo_invoice_id", "is not", null)
        .where("qbo_invoice_mismatch", "=", 1)
        .compile(),
    [],
  );

  return useTypedQuery(compiled, expect<NeedAttentionRow>());
}
