import { validatePaymentSchedule } from "../utils/resolvePaymentSchedule";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { PaymentInstallment } from "../types/quoteTypes";
import { Currency } from "../types/quoteTypes";
import {
  diffSchedule,
  describeBlockedRemovals,
  ScheduleBlockedError,
  type ExistingInstallment,
} from "../utils/scheduleDiff";

type StoredInstallmentRow = {
  id: string;
  due_date: string | null;
  percentage_bps: number | null;
  currency: string | null;
};

type StoredPaymentRow = {
  installment_id: string | null;
  amount_cents: number | null;
  status: string | null;
};

async function loadExisting(eventUuid: string): Promise<ExistingInstallment[]> {
  const rows = await typedGetAll(
    db
      .selectFrom("PaymentInstallments")
      .select(["id", "due_date", "percentage_bps", "currency"])
      .where("event_uuid", "=", eventUuid)
      .compile(),
    expect<StoredInstallmentRow>(),
  );

  return rows.map((r) => ({
    id: r.id,
    dueDate: r.due_date ?? "",
    percentageBps: r.percentage_bps ?? 0,
    currency: r.currency,
  }));
}

/**
 * Sync payment installments for an event via PowerSync.
 *
 * A save writes only what actually changed. It used to delete every installment
 * and re-insert the set, which broke the payments pointing at those rows.
 * Removing an installment that has
 * money against it is refused outright — see
 * docs/specs/payment-accounting-truth.md §4.
 *
 * @throws {ScheduleBlockedError} when a removal would orphan recorded money.
 *   The message is written for the person saving the quote and shown as-is.
 */
export async function syncPaymentInstallments(
  eventUuid: string,
  installments: PaymentInstallment[],
  currency: Currency,
): Promise<void> {
  const error = validatePaymentSchedule(installments);
  if (error) throw new Error(error);
  const existing = await loadExisting(eventUuid);
  const diff = diffSchedule(existing, installments, currency);

  if (diff.toDelete.length > 0) {
    const payments = await typedGetAll(
      db
        .selectFrom("PaymentHistory")
        .select(["installment_id", "amount_cents", "status"])
        .where("event_uuid", "=", eventUuid)
        .compile(),
      expect<StoredPaymentRow>(),
    );

    // Refuse here rather than letting the database refuse on upload, where a
    // rejected write stalls the PowerSync queue instead of reaching anyone.
    const blocked = describeBlockedRemovals(
      diff.toDelete,
      existing,
      payments.map((p) => ({
        installmentId: p.installment_id,
        amountCents: p.amount_cents ?? 0,
        status: p.status ?? "",
      })),
      currency,
    );
    if (blocked) throw new ScheduleBlockedError(blocked);

    await typedExecute(
      db.deleteFrom("PaymentInstallments").where("id", "in", diff.toDelete).compile(),
    );
  }

  for (const inst of diff.toUpdate) {
    await typedExecute(
      db
        .updateTable("PaymentInstallments")
        .set({
          due_date: inst.dueDate || null,
          percentage_bps: inst.percentageBps,
          currency: currency,
        })
        .where("id", "=", inst.id)
        .compile(),
    );
  }

  for (const inst of diff.toInsert) {
    await typedExecute(
      db
        .insertInto("PaymentInstallments")
        .values({
          id: inst.id,
          event_uuid: eventUuid,
          due_date: inst.dueDate || null,
          percentage_bps: inst.percentageBps,
          currency: currency,
          created_at: new Date().toISOString(),
        })
        .compile(),
    );
  }
}

type InstallmentRow = {
  id: string;
  due_date: string | null;
  percentage_bps: number | null;
};

/**
 * Fetch payment installments for an event (one-time, non-reactive read).
 */
export async function fetchPaymentInstallments(eventUuid: string): Promise<PaymentInstallment[]> {
  const compiled = db
    .selectFrom("PaymentInstallments")
    .select(["id", "due_date", "percentage_bps"])
    .where("event_uuid", "=", eventUuid)
    .orderBy("due_date", "asc")
    .compile();

  const rows = await typedGetAll(compiled, expect<InstallmentRow>());

  return rows.map((r) => ({
    id: r.id,
    dueDate: r.due_date ?? "",
    percentageBps: r.percentage_bps ?? 0,
  }));
}
