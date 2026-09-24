"use client";

import { useMemo } from "react";
import { CalendarClock, CalendarPlus, Pencil } from "lucide-react";
import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { formatCurrency } from "../../../utils/formatCurrency";
import { calculateTotals } from "../../../utils/calculateTotals";
import {
  resolvePaymentSchedule,
  validatePaymentSchedule,
} from "../../../utils/resolvePaymentSchedule";

function formatDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "No date";
  return new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The schedule sits in its own card, with its edit button inside it and labelled with what it
 * edits: a bare pencil in the section header, right under the totals, read as editing a price.
 */
export function PaymentScheduleSection() {
  const lineItems = useCreateQuoteStore((s) => s.lineItems);
  const currency = useCreateQuoteStore((s) => s.currency);
  const taxPercent = useCreateQuoteStore((s) => s.taxPercent);
  const taxOverrideCents = useCreateQuoteStore((s) => s.taxOverrideCents);
  const scheduleError = useCreateQuoteStore((s) => s.scheduleError);
  const installments = useCreateQuoteStore((s) => s.paymentInstallments);
  const setField = useCreateQuoteStore((s) => s.setField);

  const totalCents = useMemo(() => {
    const { subtotal, discountTotal, taxAmount } = calculateTotals(lineItems, taxPercent);
    const effectiveTaxCents = taxOverrideCents ?? taxAmount;
    return subtotal + discountTotal + effectiveTaxCents;
  }, [lineItems, taxPercent, taxOverrideCents]);

  const error = scheduleError ?? validatePaymentSchedule(installments);
  const resolved = resolvePaymentSchedule(installments, Math.max(0, Math.round(totalCents)));
  const openEditor = () => setField("isEditPaymentScheduleModalOpen", true);
  const money = (cents: number) => formatCurrency(cents / 100, currency);

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
        Payment Schedule
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        When the client pays the quote total, split into installments with due dates.
      </p>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {installments.length === 0 ? (
        <button
          type="button"
          onClick={openEditor}
          className="w-full flex items-center gap-4 rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-5 text-left hover:border-darkBlue hover:bg-blue-50/40 transition cursor-pointer group"
        >
          <CalendarClock className="w-8 h-8 shrink-0 text-gray-400 group-hover:text-darkBlue transition" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-700">No payment schedule yet</div>
            <div className="text-xs text-gray-500">
              Optional. Split {money(totalCents)} into installments, e.g. a deposit on signing and
              the balance before the event.
            </div>
          </div>
          <span className="shrink-0 flex items-center gap-1.5 rounded-sm bg-darkBlue px-3 py-2 text-sm font-semibold text-white group-hover:bg-lightBlue transition">
            <CalendarPlus className="w-4 h-4" />
            Set up schedule
          </span>
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">
              {installments.length} {installments.length === 1 ? "installment" : "installments"}
            </span>
            <button
              type="button"
              onClick={openEditor}
              className="flex items-center gap-1.5 rounded-sm border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit schedule
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium w-12">#</th>
                <th className="px-4 py-2 text-left font-medium">Due date</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resolved.map((inst, idx) => (
                <tr key={inst.id}>
                  <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-2 font-medium">{formatDueDate(inst.dueDate)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {inst.percentageBps / 100}%
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{money(inst.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            className={`flex items-center justify-between gap-3 rounded-b-lg border-t px-4 py-2 text-sm ${
              !error
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <span className="font-medium">
              {!error ? "100% scheduled" : "Percentages must total 100%"}
            </span>
            <span className="font-semibold">
              {money(resolved.reduce((sum, i) => sum + i.amountCents, 0))} / {money(totalCents)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
