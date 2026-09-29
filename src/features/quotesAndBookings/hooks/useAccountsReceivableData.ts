"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import type { AccountsReceivableEvent, QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import {
  receivablesByTab,
  type EventLineTotalRow,
  type ReceivableInstallmentRow,
  type ReceivablePaymentRow,
} from "../utils/accountsReceivable";
import type { ReceivablesTab } from "../utils/listTabs";
import { useToday } from "./useToday";

/**
 * The rows of both AR tabs, built from the list the page has already loaded and
 * filtered (`useQuotesAndBookingsData`).
 *
 * PowerSync's `useQuery` has no "enabled" switch, so laziness comes from where
 * this is called: `AccountsReceivableTabs`, which the page mounts the first
 * time an AR tab is opened and then keeps. Until then these three queries are
 * not even registered; after that, switching tabs re-runs neither the queries
 * nor the allocation — both tabs come out of the one memoized pass below.
 */
export function useAccountsReceivableData(
  events: QuotesBookingsEvent[] | undefined,
  currencyOf: (event: QuotesBookingsEvent) => Currency,
): {
  data: Record<ReceivablesTab, AccountsReceivableEvent[]> | undefined;
  isLoading: boolean;
  error: Error | undefined;
} {
  const timezone = useTimezoneStore((s) => s.timezone);
  // "Today" in the timezone the rest of the page's date filters use; it rolls
  // over at midnight, so a tab left open moves events from AR Deposits to AR.
  const today = useToday(timezone);

  // Summed in SQL: the list needs one number per event, not every line item.
  const lineTotalsCompiled = useMemo(
    () =>
      db
        .selectFrom("EventLineItems")
        .select([
          "event_uuid",
          sql<number>`sum(coalesce(${sql.ref("quantity")}, 1) * coalesce(${sql.ref("value_cents")}, 0))`.as(
            "line_total_cents",
          ),
        ])
        .where("deleted", "=", 0)
        .groupBy("event_uuid")
        .compile(),
    [],
  );

  const installmentsCompiled = useMemo(
    () =>
      db
        .selectFrom("PaymentInstallments")
        .select(["id", "event_uuid", "due_date", "percentage_bps"])
        .compile(),
    [],
  );

  const paymentsCompiled = useMemo(
    () =>
      db
        .selectFrom("PaymentHistory")
        .select([
          "id",
          "event_uuid",
          "installment_id",
          "amount_cents",
          "currency",
          "status",
          "paid_at",
          "created_at",
        ])
        .compile(),
    [],
  );

  const lineTotals = useTypedQuery(lineTotalsCompiled, expect<EventLineTotalRow>());
  const installments = useTypedQuery(installmentsCompiled, expect<ReceivableInstallmentRow>());
  const payments = useTypedQuery(paymentsCompiled, expect<ReceivablePaymentRow>());

  const isLoading = lineTotals.isLoading || installments.isLoading || payments.isLoading;
  const error = lineTotals.error ?? installments.error ?? payments.error;

  const data = useMemo(() => {
    if (!events || isLoading) return undefined;
    return receivablesByTab(
      events,
      {
        lineTotals: lineTotals.data,
        installments: installments.data,
        payments: payments.data,
      },
      currencyOf,
      today,
    );
  }, [events, isLoading, lineTotals.data, installments.data, payments.data, currencyOf, today]);

  return { data, isLoading, error };
}
