"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  describeInvoiceCheck,
  type InvoiceCheckDescription,
} from "../../../utils/invoiceCheckTime";

/**
 * When the quote's invoice was last checked against QuickBooks, under the invoice buttons. Reads the
 * two check columns reactively, so a Check again that succeeds clears a red line without a reload.
 * Spec: docs/specs/qbo-invoice-08-view-and-check.md §4 (the check time)
 */

type CheckRow = {
  qbo_invoice_checked_at: string | null;
  qbo_invoice_check_failed_at: string | null;
};

export function InvoiceCheckTimeView({ description }: { description: InvoiceCheckDescription }) {
  return (
    <div className="mt-1 text-xs">
      {description.lines.map((line, index) => (
        <p
          key={line}
          className={description.failed && index === 0 ? "text-red-600" : "text-gray-500"}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

export function InvoiceCheckTime({ eventId }: { eventId: string }) {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Events")
        .select(["qbo_invoice_checked_at", "qbo_invoice_check_failed_at"])
        .where("id", "=", eventId)
        .limit(1)
        .compile(),
    [eventId],
  );
  const { data } = useTypedQuery(compiled, expect<CheckRow>());

  // Until the event is in the local database there is nothing true to say; "Not checked yet" would be.
  const row = data?.[0];
  if (!row) return null;

  return (
    <InvoiceCheckTimeView
      description={describeInvoiceCheck(
        row.qbo_invoice_checked_at,
        row.qbo_invoice_check_failed_at,
      )}
    />
  );
}
