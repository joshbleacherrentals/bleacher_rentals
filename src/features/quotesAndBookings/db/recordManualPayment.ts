import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import { Currency } from "../types/quoteTypes";
import { ManualPaymentMethod } from "../types/paymentTypes";
import { MAX_PAYMENT_CENTS } from "../utils/parseAmountInput";
import { describePaymentForLog, paymentLogFieldName } from "../utils/paymentEdit";
import { eventLogInsert } from "./eventLogInsert";

/**
 * Records money that never touched Stripe: a check, an ACH transfer, a card
 * run by hand on a terminal.
 *
 * Local-first, and that matters more here than usual. The row goes into the
 * PowerSync DB and appears in the history table immediately; the upload
 * connector replays it to PostgREST under the user's Clerk JWT, where the RLS
 * INSERT policy — not this function — decides whether it is allowed.
 *
 * **The upload's verdict never comes back.** `typedExecuteBatch` resolves once
 * the rows are in the local database. If PostgREST later refuses them, the
 * connector treats the code as fatal and discards the transaction with a
 * console error (BackendConnector.ts:110). So a resolved promise here means
 * "written locally", not "accepted" — which is why the guards below run before
 * the write rather than trusting the CHECK constraints to catch a bad row. A
 * constraint violation is code 23514, and that is in the fatal set too: it
 * would take the payment down silently.
 *
 * **The payment and its `EventChangeLog` row are ONE write transaction**
 * (docs/specs/event-change-log-01-payment-recorded.md R2), as in
 * `editManualPayment`. The connector discards a whole transaction it is
 * refused, so a payment that is refused leaves no row behind. The row says
 * amount, method and paid date and nothing else — never the notes.
 *
 * Amounts are signed. A negative row is a refund, a bounced check or the
 * correction of a typo, and it is the only way to undo anything in an
 * append-only ledger.
 *
 * See docs/specs/manual-payment-entry.md §3.1, §4.3, §5, T0, T4.
 */

export type RecordManualPaymentInput = {
  eventId: string;
  /** Writes BOTH installment columns; null means unapplied. §4.3 */
  installmentId: string | null;
  /** Non-zero. Negative is a refund / correction. */
  amountCents: number;
  /** Always the event's currency — another one is excluded from every total. */
  currency: Currency;
  method: ManualPaymentMethod;
  payerName: string;
  /** Check number, ACH trace, terminal auth code. */
  reference: string | null;
  notes: string | null;
  /** ISO. The date the money moved, not "now". */
  paidAt: string;
  recordedByUserUuid: string;
};

export async function recordManualPayment(input: RecordManualPaymentInput): Promise<void> {
  if (input.amountCents === 0) {
    throw new Error("A payment cannot be zero.");
  }
  if (Math.abs(input.amountCents) > MAX_PAYMENT_CENTS) {
    throw new Error("That amount is too large to record.");
  }
  if (!input.recordedByUserUuid) {
    throw new Error("A manual payment must say who recorded it.");
  }

  // Generated here so a retried upload upserts the same row rather than
  // recording the payment twice — and so the Log row can name it.
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await typedExecuteBatch([
    db
      .insertInto("PaymentHistory")
      .values({
        id,
        event_uuid: input.eventId,
        // The live link the allocation reads, and the historical fact that
        // survives a schedule rebuild. One choice, both columns.
        installment_id: input.installmentId,
        intended_installment_id: input.installmentId,
        amount_cents: input.amountCents,
        currency: input.currency,
        // Manual rows are money that has already arrived. There is no pending
        // state: a transfer that later fails is a negative row.
        status: "succeeded",
        entry_source: "manual",
        payment_method_type: input.method,
        payer_name: input.payerName,
        reference: input.reference,
        notes: input.notes,
        recorded_by_user_uuid: input.recordedByUserUuid,
        paid_at: input.paidAt,
        created_at: createdAt,
      })
      .compile(),
    eventLogInsert({
      eventId: input.eventId,
      changedByUserUuid: input.recordedByUserUuid,
      // The log has no column for a payment's id, so it travels here (spec 09, D1 C).
      fieldName: paymentLogFieldName(id),
      prevValue: null,
      // "$100.00 · Check · Aug 14, 2026" — from what is being written, so the row says the
      // same as the payment (D3). The paid date is the day the user typed (R3).
      nextValue: describePaymentForLog({
        amountCents: input.amountCents,
        currency: input.currency,
        paymentMethodType: input.method,
        entrySource: "manual",
        paidAt: input.paidAt,
        createdAt,
      }),
      actionType: "payment_add",
    }),
  ]);
}
