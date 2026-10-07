import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import {
  describePaymentForLog,
  normalizeDeleteReason,
  paymentLogFieldName,
  type PaymentForEdit,
} from "../utils/paymentEdit";

/**
 * Soft-deletes a manual payment
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3).
 *
 * The row stays; it is marked deleted, with who, when and why, and it no longer counts anywhere
 * (spec 08). A deletion writes exactly the four columns the database lets it write
 * (`deleted_at`, `deleted_by_user_uuid`, `delete_reason`, and `installment_id`, which becomes null
 * so that a deleted payment never blocks the schedule — spec 07, D7), and `intended_installment_id`,
 * the historical fact, is left as it was. A deleted payment cannot come back.
 *
 * Local-first, with the guards run here first because a refused upload is discarded silently. The
 * update and its `EventChangeLog` row are one write transaction, so a refusal that raises takes
 * both. The log row describes the payment and carries NO reason: anyone who can open the Log tab
 * could read it, and the reason is for those who write payments (spec 09, D7).
 */

export type DeleteManualPaymentInput = {
  /** The quote or booking the payment belongs to — the log row is filed under it. */
  eventId: string;
  /** The payment as it stands now, including whether it is already deleted. */
  payment: PaymentForEdit & { deletedAt: string | null };
  /** Why. Required; spaces do not count. */
  reason: string;
  /** Who is deleting it; the database requires it to be the caller. */
  deletedByUserUuid: string | null;
};

export async function deleteManualPayment(input: DeleteManualPaymentInput): Promise<void> {
  const { payment } = input;

  if (payment.entrySource !== "manual") {
    throw new Error("Only a manual payment can be deleted.");
  }
  if (payment.deletedAt) {
    throw new Error("This payment is already deleted.");
  }
  if (!input.deletedByUserUuid) {
    throw new Error("A deletion must say who made it.");
  }
  const reason = normalizeDeleteReason(input.reason);
  if (!reason) {
    throw new Error("A reason is required to delete a payment.");
  }

  await typedExecuteBatch([
    db
      .updateTable("PaymentHistory")
      .set({
        deleted_at: new Date().toISOString(),
        deleted_by_user_uuid: input.deletedByUserUuid,
        delete_reason: reason,
        installment_id: null,
      })
      .where("id", "=", payment.id)
      .compile(),
    db
      .insertInto("EventChangeLog")
      .values({
        id: crypto.randomUUID(),
        event_uuid: input.eventId,
        changed_by_user_uuid: input.deletedByUserUuid,
        field_name: paymentLogFieldName(payment.id),
        prev_value: describePaymentForLog(payment),
        next_value: null,
        action_type: "payment_delete",
        changed_at: new Date().toISOString(),
      })
      .compile(),
  ]);
}
