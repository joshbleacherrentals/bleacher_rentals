"use client";

import { useCallback, useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { useOfficeCurrencies } from "@/features/quotesAndBookings/hooks/useOfficeCurrencies";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import type {
  EventLineTotalRow,
  ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import { pickEventCurrency } from "@/features/quotesAndBookings/utils/eventCurrency";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  collectedPayments,
  type CollectedPayment,
  type FirstSignatureRow,
  type KpiEventRow,
  type KpiInstallmentRow,
} from "../utils/collectionDays";

/**
 * The five local queries behind the KPI cards, and the collected payments worked out from them.
 * docs/specs/accountant-kpi.md §2.1, §2.3 (C1, D4, D9).
 *
 * Nothing here depends on the date range, so choosing another range never runs the allocation
 * again: the range only filters the rows this returns (`kpiForRange`). The queries are PowerSync
 * watchers, so the numbers follow every change to a schedule or a payment at once (D7).
 *
 * The builders are exported for the SQL test. The aggregates use the callback form
 * (`.select(({ fn }) => ...)`): the app's `db` proxy strips the methods off `db.fn`.
 */

/** C1, D4: booked events that are not deleted. `unsigned_changes` is not booked. */
export function buildKpiEventsQuery() {
  return db
    .selectFrom("Events")
    .select(["id", "sales_office_uuid", "tax_percent", "tax_amount_cents", "booked_at"])
    .where("event_status", "=", "booked")
    .where("deleted", "=", 0);
}

/** One event's line items summed in SQL, as `useAccountsReceivableData` does it. */
export function buildKpiLineTotalsQuery() {
  return db
    .selectFrom("EventLineItems")
    .select([
      "event_uuid",
      sql<number>`sum(coalesce(${sql.ref("quantity")}, 1) * coalesce(${sql.ref("value_cents")}, 0))`.as(
        "line_total_cents",
      ),
    ])
    .where("deleted", "=", 0)
    .groupBy("event_uuid");
}

export function buildKpiInstallmentsQuery() {
  return db
    .selectFrom("PaymentInstallments")
    .select(["id", "event_uuid", "due_date", "percentage_bps", "due_on_signing"]);
}

/** Every payment, deleted ones too: `allocatePayments` decides what counts. */
export function buildKpiPaymentsQuery() {
  return db
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
      "deleted_at",
    ]);
}

/** D9: the earliest signature of each event, whatever its status. */
export function buildKpiFirstSignaturesQuery() {
  return db
    .selectFrom("ContractSignatures")
    .select(({ fn }) => ["event_uuid", fn.min<string | null>("signed_at").as("first_signed_at")])
    .groupBy("event_uuid");
}

export function useKpiData(): {
  /** Undefined while anything is loading or has failed. */
  rows: CollectedPayment[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
} {
  const { currencyByOfficeId, isLoading: currenciesLoading } = useOfficeCurrencies();

  const eventsCompiled = useMemo(() => buildKpiEventsQuery().compile(), []);
  const lineTotalsCompiled = useMemo(() => buildKpiLineTotalsQuery().compile(), []);
  const installmentsCompiled = useMemo(() => buildKpiInstallmentsQuery().compile(), []);
  const paymentsCompiled = useMemo(() => buildKpiPaymentsQuery().compile(), []);
  const signaturesCompiled = useMemo(() => buildKpiFirstSignaturesQuery().compile(), []);

  const events = useTypedQuery(eventsCompiled, expect<KpiEventRow>());
  const lineTotals = useTypedQuery(lineTotalsCompiled, expect<EventLineTotalRow>());
  const installments = useTypedQuery(installmentsCompiled, expect<KpiInstallmentRow>());
  const payments = useTypedQuery(paymentsCompiled, expect<ReceivablePaymentRow>());
  const signatures = useTypedQuery(signaturesCompiled, expect<FirstSignatureRow>());

  // Until the office currencies have loaded every event reads as USD, which would leave the
  // payments of a Canadian event out, so that moment counts as loading.
  const isLoading =
    currenciesLoading ||
    events.isLoading ||
    lineTotals.isLoading ||
    installments.isLoading ||
    payments.isLoading ||
    signatures.isLoading;
  const error =
    events.error ?? lineTotals.error ?? installments.error ?? payments.error ?? signatures.error;

  const currencyOf = useCallback(
    (event: KpiEventRow): Currency =>
      pickEventCurrency(event.sales_office_uuid, currencyByOfficeId),
    [currencyByOfficeId],
  );

  const rows = useMemo(() => {
    if (isLoading || error) return undefined;
    return collectedPayments(
      {
        events: events.data,
        lineTotals: lineTotals.data,
        installments: installments.data,
        payments: payments.data,
        firstSignatures: signatures.data,
      },
      currencyOf,
    );
  }, [
    isLoading,
    error,
    events.data,
    lineTotals.data,
    installments.data,
    payments.data,
    signatures.data,
    currencyOf,
  ]);

  return { rows, isLoading, error };
}
