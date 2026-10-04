import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import { MAX_PAYMENT_CENTS, parseAmountInput } from "../utils/parseAmountInput";
import {
  buildPaymentPatch,
  describePaymentChanges,
  paymentLogFieldName,
  type PaymentForEdit,
} from "../utils/paymentEdit";
import type { RecordPaymentDraft } from "../utils/recordPaymentForm";

/**
 * Edits a manual payment that was already recorded
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3).
 *
 * Local-first, like `recordManualPayment`: the change goes into the PowerSync database and shows at
 * once; the upload connector replays it to PostgREST, where the UPDATE policy and the guard trigger
 * of spec 07 — not this function — decide whether it is allowed. The verdict never comes back, and a
 * refusal that raises (42501, 23514) is discarded without a word to the code that wrote it. So what
 * the database would refuse is refused here first, before anything is written.
 *
 * The payment update and its `EventChangeLog` row are written in ONE write transaction. The
 * connector uploads and, on a refusal, discards a whole transaction: written separately, a refused
 * change would leave its log row behind. (A change the UPDATE policy merely filters out raises
 * nothing, and its log row still goes up — spec 09 §7.)
 *
 * Only the columns that changed are written, and never one the database will not let anyone change.
 */

export type EditManualPaymentInput = {
  /** The quote or booking the payment belongs to — the log row is filed under it. */
  eventId: string;
  /** The payment as it stands now, including whether it is already deleted. */
  payment: PaymentForEdit & { deletedAt: string | null };
  /** What the form holds. */
  draft: RecordPaymentDraft;
  /** Who is editing; written to the log. */
  changedByUserUuid: string | null;
  /** Words an installment for the log: "Due Aug 31, 2026", or "Not applied" for null. */
  installmentLabel: (installmentId: string | null) => string;
};

export async function editManualPayment(input: EditManualPaymentInput): Promise<void> {
  const { payment, draft } = input;

  if (payment.entrySource !== "manual") {
    throw new Error("Only a manual payment can be edited.");
  }
  if (payment.deletedAt) {
    throw new Error("A deleted payment cannot be edited.");
  }
  if (!input.changedByUserUuid) {
    throw new Error("An edit must say who made it.");
  }

  const amount = parseAmountInput(draft.amountRaw);
  if (!amount.ok) {
    throw new Error(
      amount.reason === "zero"
        ? "A payment cannot be zero."
        : amount.reason === "too-large"
          ? `That amount is too large to record (the limit is ${MAX_PAYMENT_CENTS / 100}).`
          : "Enter a valid amount.",
    );
  }

  const { changed, columns } = buildPaymentPatch(payment, draft);
  if (changed.length === 0) {
    throw new Error("Nothing was changed.");
  }

  const { prev, next } = describePaymentChanges(payment, draft, changed, input.installmentLabel);

  await typedExecuteBatch([
    db.updateTable("PaymentHistory").set(columns).where("id", "=", payment.id).compile(),
    db
      .insertInto("EventChangeLog")
      .values({
        id: crypto.randomUUID(),
        event_uuid: input.eventId,
        changed_by_user_uuid: input.changedByUserUuid,
        // The log has no column for a payment's id, so it travels here (spec 09, D1 C).
        field_name: paymentLogFieldName(payment.id),
        prev_value: prev,
        next_value: next,
        action_type: "payment_edit",
        changed_at: new Date().toISOString(),
      })
      .compile(),
  ]);
}
