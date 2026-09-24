"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";

type Row = {
  id: string;
  due_date: string | null;
  percentage_bps: number | null;
  currency: string | null;
};

/**
 * One row of the payment schedule: what is owed and when, nothing about what
 * has arrived. Paid/due is derived from PaymentHistory by `allocatePayments`
 * wherever it is shown — see docs/specs/payment-accounting-truth.md §3.7.
 */
export type PaymentInstallmentRow = {
  id: string;
  dueDate: string;
  percentageBps: number;
  currency: string;
};

export function usePaymentInstallments(eventId: string | null) {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("PaymentInstallments")
        .select(["id", "due_date", "percentage_bps", "currency"])
        .where("event_uuid", "=", eventId ?? "")
        .orderBy("due_date", "asc")
        .compile(),
    [eventId],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const installments = useMemo<PaymentInstallmentRow[]>(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        dueDate: r.due_date ?? "",
        percentageBps: r.percentage_bps ?? 0,
        currency: r.currency ?? "USD",
      })),
    [data],
  );

  return { installments, isLoading, error };
}
