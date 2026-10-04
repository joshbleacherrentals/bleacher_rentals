"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { Currency } from "../../../types/quoteTypes";
import type { PaymentHistoryRow } from "../../../hooks/usePaymentHistory";
import { deleteManualPayment } from "../../../db/deleteManualPayment";
import { formatMoney } from "../../../utils/formatMoney";
import { isAcceptableDeleteReason } from "../../../utils/paymentEdit";

/**
 * Asks why a manual payment is being deleted, and deletes it
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, D4).
 *
 * Only the reason prompt, no second confirmation: its Delete button is disabled while the reason is
 * empty after trimming, and pressing it soft-deletes the payment. The row stays on the record, no
 * longer counts, and cannot be restored — which the prompt says before anyone presses anything.
 */

export type DeleteReasonFormProps = {
  reason: string;
  onReasonChange: (reason: string) => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onDelete: () => void;
};

/** The prompt itself, apart from the dialog frame, so that the rule on its button is easy to test. */
export function DeleteReasonForm({
  reason,
  onReasonChange,
  isSubmitting,
  onCancel,
  onDelete,
}: DeleteReasonFormProps) {
  const canDelete = isAcceptableDeleteReason(reason) && !isSubmitting;

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="dp-reason">
          Reason
        </label>
        <textarea
          id="dp-reason"
          rows={3}
          className="w-full border rounded px-2 py-1.5 text-sm"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Why is this payment being deleted?"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 border rounded">
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="text-sm px-3 py-1.5 rounded text-white bg-red-700 disabled:bg-gray-300"
        >
          {isSubmitting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </>
  );
}

export type DeletePaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The quote or booking the payment belongs to — the log row is filed under it. */
  eventId: string;
  payment: PaymentHistoryRow;
  /** `Users.id` of whoever is deleting; the database requires it to be the caller. */
  deletedByUserUuid: string | null;
};

export function DeletePaymentDialog({
  open,
  onOpenChange,
  eventId,
  payment,
  deletedByUserUuid,
}: DeletePaymentDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Chained, like the record dialog: a second click cannot overtake the first.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const handleDelete = () => {
    if (!isAcceptableDeleteReason(reason) || isSubmitting) return;
    if (!deletedByUserUuid) {
      createErrorToast(["Cannot delete a payment: your user account could not be identified."]);
      return;
    }

    setIsSubmitting(true);
    writeQueue.current = writeQueue.current
      .then(() => deleteManualPayment({ eventId, payment, reason, deletedByUserUuid }))
      .then(() => onOpenChange(false))
      .catch((err: any) => {
        createErrorToast(["Failed to delete the payment.", err?.message ?? ""]);
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Payment</DialogTitle>
          <DialogDescription>
            {formatMoney(payment.amountCents, payment.currency as Currency)} from{" "}
            {payment.payerName}. The payment stays on the record, no longer counts toward any total,
            and cannot be restored.
          </DialogDescription>
        </DialogHeader>

        <DeleteReasonForm
          reason={reason}
          onReasonChange={setReason}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onDelete={handleDelete}
        />
      </DialogContent>
    </Dialog>
  );
}
