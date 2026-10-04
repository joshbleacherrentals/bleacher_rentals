"use client";

import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { Currency } from "../../../types/quoteTypes";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../../../types/paymentTypes";
import { formatMoney } from "../../../utils/formatMoney";
import { formatDate } from "../../../utils/formatDate";
import {
  draftFromPayment,
  emptyDraft,
  evaluateRecordPaymentForm,
} from "../../../utils/recordPaymentForm";
import { recordManualPayment } from "../../../db/recordManualPayment";
import { editManualPayment } from "../../../db/editManualPayment";
import type { InstallmentAllocation } from "../../../utils/allocatePayments";
import type { PaymentHistoryRow } from "../../../hooks/usePaymentHistory";

/**
 * Records money that never touched Stripe — or, in `edit` mode, edits a manual payment that was
 * already recorded (docs/specs/accountant-quotes-09, D3): the same fields and rules, one dialog.
 * In edit mode the title and the button change, Save stays off until something differs, and the
 * write goes through `editManualPayment`. The payment's currency is its own and never changes.
 *
 * Everything it decides — whether the amount is submittable, what the button
 * says, which label the Reference field carries — comes from
 * `evaluateRecordPaymentForm`, so the rules are tested without a DOM and this
 * file stays a rendering of them.
 *
 * See docs/specs/manual-payment-entry.md §6.2, §6.3.
 */

type RecordPaymentDialogBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  currency: Currency;
  /**
   * Whether `currency` is the office's real answer yet (§3.5, E5). Required, so
   * a caller cannot let the fallback through by omission.
   */
  currencyResolved: boolean;
  installments: InstallmentAllocation[];
  defaultPayerName: string;
  recordedByUserUuid: string | null;
  /** Injected so the "no future dates" rule is testable and stable. */
  today?: string;
};

export type RecordPaymentDialogProps = RecordPaymentDialogBaseProps &
  (
    | { mode?: "record"; payment?: undefined }
    | {
        mode: "edit";
        /** The manual payment being edited; its own currency is the one the form shows. */
        payment: PaymentHistoryRow;
      }
  );

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  eventId,
  currency,
  currencyResolved,
  installments,
  defaultPayerName,
  recordedByUserUuid,
  today = todayIso(),
  mode = "record",
  payment,
}: RecordPaymentDialogProps) {
  const isEdit = mode === "edit" && payment !== undefined;
  // What the payment said when the edit began; Save stays off until the draft says something else.
  const original = useMemo(() => (payment ? draftFromPayment(payment) : null), [payment]);
  const shownCurrency = (isEdit ? payment.currency : currency) as Currency;

  const [draft, setDraft] = useState(
    () => original ?? emptyDraft({ payerName: defaultPayerName, today }),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = evaluateRecordPaymentForm(
    draft,
    today,
    isEdit && original
      ? { mode: "edit", original, isSubmitting }
      : { currencyResolved, isSubmitting },
  );

  // Chained, like the QuickBooks flag on the tab behind this dialog: a second
  // click cannot overtake the first and record the payment twice.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSubmit = () => {
    if (!state.canSubmit || state.amountCents === null) return;
    if (!recordedByUserUuid) {
      createErrorToast([
        `Cannot ${isEdit ? "edit" : "record"} a payment: your user account could not be identified.`,
      ]);
      return;
    }

    if (isEdit) {
      // How the log words an installment: by its due date, as the list the user picked it from does.
      const installmentLabel = (id: string | null) => {
        if (!id) return "Not applied";
        const found = installments.find((i) => i.installmentId === id);
        return found
          ? `Due ${formatDate(found.dueDate)}`
          : "An installment no longer on the schedule";
      };

      setIsSubmitting(true);
      writeQueue.current = writeQueue.current
        .then(() =>
          editManualPayment({
            eventId,
            payment,
            draft,
            changedByUserUuid: recordedByUserUuid,
            installmentLabel,
          }),
        )
        .then(() => onOpenChange(false))
        .catch((err: any) => {
          createErrorToast(["Failed to save the payment.", err?.message ?? ""]);
        })
        .finally(() => setIsSubmitting(false));
      return;
    }

    setIsSubmitting(true);
    writeQueue.current = writeQueue.current
      .then(() =>
        recordManualPayment({
          eventId,
          installmentId: draft.installmentId,
          amountCents: state.amountCents!,
          currency,
          method: draft.method,
          payerName: draft.payerName.trim(),
          reference: draft.reference.trim() || null,
          notes: draft.notes.trim() || null,
          // Stored as an instant; the user chose a day, so anchor it at noon
          // to keep the date the same either side of a timezone.
          paidAt: new Date(`${draft.paidAtDate}T12:00:00`).toISOString(),
          recordedByUserUuid,
        }),
      )
      .then(() => {
        setDraft(emptyDraft({ payerName: defaultPayerName, today }));
        onOpenChange(false);
      })
      .catch((err: any) => {
        createErrorToast(["Failed to record the payment.", err?.message ?? ""]);
      })
      .finally(() => setIsSubmitting(false));
  };

  const field = "w-full border rounded px-2 py-1.5 text-sm";
  const label = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Payment" : "Record Payment"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Change what was recorded. The payment stays in ${shownCurrency}; its currency cannot change.`
              : "For money that did not come through Stripe. Stripe payments appear here on their own once the client pays online."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <span className={label}>Payment Type</span>
            <div className="flex gap-1">
              {MANUAL_PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => set("method", method)}
                  className={`flex-1 text-xs border rounded px-2 py-1.5 ${
                    draft.method === method
                      ? "bg-darkBlue text-white border-darkBlue"
                      : "bg-white text-gray-700"
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
            {draft.method === "ach" && (
              <p className="text-xs text-gray-500 mt-1">
                Recorded as received. If the transfer later fails, enter a negative amount.
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="rp-amount">
              Amount ({shownCurrency})
            </label>
            <input
              id="rp-amount"
              className={`${field} ${state.isNegative ? "text-red-600 font-semibold" : ""}`}
              value={draft.amountRaw}
              onChange={(e) => set("amountRaw", e.target.value)}
              placeholder="0.00"
              inputMode="text"
              autoComplete="off"
            />
            {state.amountError && <p className="text-xs text-red-600 mt-1">{state.amountError}</p>}
            {/* Not an error the user made, so it is not styled as one — they are
                waiting on the office's currency and can only wait. */}
            {state.currencyError && (
              <p className="text-xs text-amber-700 mt-1">{state.currencyError}</p>
            )}
            {state.isNegative && (
              <p className="text-xs text-red-700 mt-1 border border-red-200 bg-red-50 rounded p-2">
                This records money going <strong>out</strong> (refund, bounced check, or
                correction). It does not issue a Stripe refund.
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="rp-date">
              Date Received
            </label>
            <input
              id="rp-date"
              type="date"
              max={today}
              className={field}
              value={draft.paidAtDate}
              onChange={(e) => set("paidAtDate", e.target.value)}
            />
            {state.dateError && <p className="text-xs text-red-600 mt-1">{state.dateError}</p>}
          </div>

          <div>
            <label className={label} htmlFor="rp-installment">
              Apply To
            </label>
            <select
              id="rp-installment"
              className={field}
              value={draft.installmentId ?? ""}
              onChange={(e) => set("installmentId", e.target.value || null)}
            >
              <option value="">Not applied to an installment</option>
              {installments.map((i) => (
                <option key={i.installmentId} value={i.installmentId}>
                  Due {formatDate(i.dueDate)} — {formatMoney(i.amountCents, currency)} (
                  {formatMoney(Math.max(0, i.amountCents - i.allocatedCents), currency)} remaining)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="rp-payer">
              Payer Name
            </label>
            <input
              id="rp-payer"
              className={field}
              value={draft.payerName}
              onChange={(e) => set("payerName", e.target.value)}
            />
            {state.payerError && <p className="text-xs text-red-600 mt-1">{state.payerError}</p>}
          </div>

          <div>
            <label className={label} htmlFor="rp-reference">
              {state.referenceLabel}
            </label>
            <input
              id="rp-reference"
              className={field}
              value={draft.reference}
              onChange={(e) => set("reference", e.target.value)}
            />
          </div>

          <div>
            <label className={label} htmlFor="rp-notes">
              Notes
            </label>
            <textarea
              id="rp-notes"
              rows={2}
              className={field}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm px-3 py-1.5 border rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!state.canSubmit}
            className={`text-sm px-3 py-1.5 rounded text-white ${
              state.isNegative ? "bg-red-700" : "bg-darkBlue"
            } disabled:bg-gray-300`}
          >
            {isSubmitting ? (isEdit ? "Saving…" : "Recording…") : state.submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
