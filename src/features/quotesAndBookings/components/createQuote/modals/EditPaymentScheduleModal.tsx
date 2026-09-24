"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { PaymentInstallment } from "../../../types/quoteTypes";
import { formatCurrency } from "../../../utils/formatCurrency";
import { calculateTotals } from "../../../utils/calculateTotals";
import { buildDefaultPaymentSchedule } from "../../../utils/buildDefaultPaymentSchedule";

import {
  resolvePaymentSchedule,
  validatePaymentSchedule,
} from "../../../utils/resolvePaymentSchedule";

type DraftRow = PaymentInstallment & {
  /** Display string for the % input — kept separate so typing "33.3" doesn't jump. */
  pctDisplay: string;
};

export function EditPaymentScheduleModal() {
  const isOpen = useCreateQuoteStore((s) => s.isEditPaymentScheduleModalOpen);
  const storeInstallments = useCreateQuoteStore((s) => s.paymentInstallments);
  const lineItems = useCreateQuoteStore((s) => s.lineItems);
  const eventStart = useCreateQuoteStore((s) => s.eventStart);
  const currency = useCreateQuoteStore((s) => s.currency);
  const taxPercent = useCreateQuoteStore((s) => s.taxPercent);
  const taxOverrideCents = useCreateQuoteStore((s) => s.taxOverrideCents);
  const setField = useCreateQuoteStore((s) => s.setField);
  const setPaymentInstallments = useCreateQuoteStore((s) => s.setPaymentInstallments);

  const [draft, setDraft] = useState<DraftRow[]>([]);

  const totalCents = useMemo(() => {
    const { subtotal, discountTotal, taxAmount } = calculateTotals(lineItems, taxPercent);
    const effectiveTaxCents = taxOverrideCents ?? taxAmount;
    return subtotal + discountTotal + effectiveTaxCents;
  }, [lineItems, taxPercent, taxOverrideCents]);

  // Initialize only when opened. Price changes recalculate amounts, never reset edits.
  useEffect(() => {
    if (!isOpen) return;
    const seed = storeInstallments.length
      ? storeInstallments
      : buildDefaultPaymentSchedule(eventStart);
    setDraft(seed.map((i) => ({ ...i, pctDisplay: String(i.percentageBps / 100) })));
  }, [isOpen, storeInstallments, eventStart]);

  const remaining =
    10000 -
    draft.reduce((sum, i) => sum + (Number.isFinite(i.percentageBps) ? i.percentageBps : 0), 0);
  const isBalanced = remaining === 0;
  const validationError = validatePaymentSchedule(draft);
  const hasMissingDates = draft.some((i) => !i.dueDate);
  const canSave = draft.length > 0 && !validationError;
  const resolved = resolvePaymentSchedule(
    draft.map((i) => ({
      ...i,
      percentageBps:
        Number.isSafeInteger(i.percentageBps) && i.percentageBps >= 0 ? i.percentageBps : 0,
    })),
    Math.max(0, Math.round(totalCents)),
  );

  const close = () => setField("isEditPaymentScheduleModalOpen", false);

  const handleAdd = () => {
    const share = Math.max(remaining, 0);
    setDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dueDate: "",
        percentageBps: share,
        pctDisplay: String(share / 100),
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setDraft((prev) => prev.filter((i) => i.id !== id));
  };

  const handleDateChange = (id: string, value: string) => {
    setDraft((prev) => prev.map((i) => (i.id === id ? { ...i, dueDate: value } : i)));
  };

  const handlePctChange = (id: string, raw: string) => {
    const share = /^\d+(\.\d{0,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
    setDraft((prev) =>
      prev.map((i) => (i.id === id ? { ...i, pctDisplay: raw, percentageBps: share } : i)),
    );
  };

  const handleSplitEvenly = () => {
    if (!draft.length) return;
    const per = Math.floor(10000 / draft.length);
    setDraft((prev) =>
      prev.map((i, index) => {
        const share = per + (index === prev.length - 1 ? 10000 - per * prev.length : 0);
        return { ...i, percentageBps: share, pctDisplay: String(share / 100) };
      }),
    );
  };

  const handleSave = () => {
    if (!canSave) return;
    setPaymentInstallments(draft.map(({ pctDisplay, ...rest }) => rest));
    close();
  };

  // The schedule is optional — clearing it returns the quote to "no schedule".
  // Only offered when a saved schedule exists.
  const hasSavedSchedule = storeInstallments.length > 0;
  const handleRemoveSchedule = () => {
    setPaymentInstallments([]);
    close();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Payment Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Total reference */}
          <div className="flex justify-between text-sm bg-gray-50 rounded px-3 py-2">
            <span className="text-gray-500">Quote Total</span>
            <span className="font-bold">{formatCurrency(totalCents / 100, currency)}</span>
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide px-1">
            <span className="w-5 shrink-0" />
            <span className="flex-1">Due Date</span>
            <span className="w-24 text-right">%</span>
            <span className="w-28 text-right">Amount</span>
            <span className="w-6" />
          </div>

          {/* Installment rows */}
          <div className="space-y-2">
            {draft.map((inst, idx) => (
              <div key={inst.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 shrink-0">#{idx + 1}</span>

                {/* Date */}
                <input
                  type="date"
                  aria-label={`Installment ${idx + 1} due date`}
                  value={inst.dueDate}
                  onChange={(e) => handleDateChange(inst.id, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-greenAccent flex-1"
                />

                {/* Percentage */}
                <div className="relative w-24">
                  <input
                    type="number"
                    aria-label={`Installment ${idx + 1} percentage`}
                    value={inst.pctDisplay}
                    onChange={(e) => handlePctChange(inst.id, e.target.value)}
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full rounded border border-gray-300 pl-2 pr-6 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-greenAccent"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    %
                  </span>
                </div>

                <output
                  className="w-28 text-right text-sm"
                  aria-label={`Installment ${idx + 1} amount`}
                >
                  {formatCurrency(resolved[idx].amountCents / 100, currency)}
                </output>

                {/* Delete */}
                <button
                  type="button"
                  aria-label={`Remove installment ${idx + 1}`}
                  onClick={() => handleRemove(inst.id)}
                  disabled={draft.length <= 1}
                  className="p-1 text-gray-400 hover:text-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Add Installment
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={handleSplitEvenly}
              disabled={draft.length === 0}
              className="text-xs text-blue-600 hover:text-blue-800 transition cursor-pointer disabled:opacity-30"
            >
              Split Evenly
            </button>
          </div>

          {/* Remaining balance */}
          <div
            className={`flex justify-between text-sm rounded px-3 py-2 ${
              isBalanced ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            <span>Remaining percentage</span>
            <span className="font-semibold">{remaining / 100}%</span>
          </div>
        </div>

        {validationError && (
          <p role="alert" className="text-sm text-red-700">
            {validationError}
          </p>
        )}
        <DialogFooter>
          {hasSavedSchedule && (
            <Button
              variant="outline"
              onClick={handleRemoveSchedule}
              className="mr-auto text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Remove Schedule
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {hasMissingDates
              ? "All due dates are required"
              : isBalanced
                ? "Save Schedule"
                : "Percentages must total 100%"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
