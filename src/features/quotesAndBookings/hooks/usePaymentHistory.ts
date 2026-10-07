"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { EntrySource } from "../types/paymentTypes";

/**
 * The payments an event actually received. This — not
 * `PaymentInstallments.status` — is what any money question is answered from.
 * See docs/specs/payment-accounting-truth.md.
 *
 * Returns EVERY row, soft-deleted ones included: `allocatePayments` leaves a deleted payment out of
 * every figure, and a list hides it with `withoutDeleted`
 * (docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md).
 */

type Row = {
  id: string;
  installment_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  payment_method_type: string | null;
  payer_name: string | null;
  payer_email: string | null;
  notes: string | null;
  stripe_receipt_url: string | null;
  paid_at: string | null;
  created_at: string | null;
  intended_installment_id: string | null;
  entry_source: string | null;
  recorded_by_user_uuid: string | null;
  reference: string | null;
  deleted_at: string | null;
  deleted_by_user_uuid: string | null;
  delete_reason: string | null;
};

export type PaymentHistoryRow = {
  id: string;
  installmentId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethodType: string | null;
  payerName: string;
  payerEmail: string | null;
  notes: string | null;
  receiptUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  /** What the payment was made against, as of the payment; never re-pointed. */
  intendedInstallmentId: string | null;
  entrySource: EntrySource;
  recordedByUserUuid: string | null;
  reference: string | null;
  /** Set when the payment was soft-deleted. The row is still returned; see utils/deletedPayments. */
  deletedAt: string | null;
  deletedByUserUuid: string | null;
  deleteReason: string | null;
};

export function usePaymentHistory(eventId: string | null) {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("PaymentHistory")
        .select([
          "id",
          "installment_id",
          "amount_cents",
          "currency",
          "status",
          "payment_method_type",
          "payer_name",
          "payer_email",
          "notes",
          "stripe_receipt_url",
          "paid_at",
          "created_at",
          "intended_installment_id",
          "entry_source",
          "recorded_by_user_uuid",
          "reference",
          "deleted_at",
          "deleted_by_user_uuid",
          "delete_reason",
        ])
        .where("event_uuid", "=", eventId ?? "")
        .orderBy("created_at", "desc")
        .compile(),
    [eventId],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  // Stable identity: the allocation downstream is memoized on this array.
  const payments = useMemo<PaymentHistoryRow[]>(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        installmentId: r.installment_id,
        amountCents: r.amount_cents ?? 0,
        currency: r.currency ?? "USD",
        status: r.status ?? "",
        paymentMethodType: r.payment_method_type,
        payerName: r.payer_name ?? "Unknown",
        payerEmail: r.payer_email,
        notes: r.notes,
        receiptUrl: r.stripe_receipt_url,
        paidAt: r.paid_at,
        createdAt: r.created_at ?? "",
        intendedInstallmentId: r.intended_installment_id,
        // Every row that predates manual entry was written by the webhook, and
        // the column defaults to 'stripe' for exactly that reason.
        entrySource: r.entry_source === "manual" ? "manual" : "stripe",
        recordedByUserUuid: r.recorded_by_user_uuid,
        reference: r.reference,
        deletedAt: r.deleted_at,
        deletedByUserUuid: r.deleted_by_user_uuid,
        deleteReason: r.delete_reason,
      })),
    [data],
  );

  return { payments, isLoading, error };
}
