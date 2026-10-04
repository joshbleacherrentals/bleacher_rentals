"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CreditCard,
  FileText,
  Pencil,
  Check,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { QuoteDocumentData } from "./quoteDocumentData";
import { TrackEvent } from "./useQuoteActivityTracker";
import { formatQuoteDate, formatQuoteMoney } from "./quoteFormat";
import { quoteText, paymentMethodLabel, statusLabel } from "./quoteStrings";
import { allocatePayments } from "../utils/allocatePayments";
import { currencySymbol } from "../utils/formatMoney";
import { computeAmountDue } from "../utils/computeAmountDue";

type PaymentHistoryRow = {
  id: string;
  installment_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  payment_method_type: string | null;
  payer_name: string;
  payer_email: string | null;
  stripe_receipt_url: string | null;
  paid_at: string | null;
  created_at: string;
};

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function PayInvoiceTab({
  data,
  track,
}: {
  data: QuoteDocumentData;
  track: (e: TrackEvent) => void;
}) {
  const { currency, language } = data;
  const s = quoteText(language);
  const formatMoney = (cents: number, cur: "USD" | "CAD" = currency) =>
    formatQuoteMoney(cents, cur, language);
  const formatDate = (d: string) => formatQuoteDate(d, language);
  const [payerName, setPayerName] = useState(data.contact?.name ?? "");
  const [payerEmail, setPayerEmail] = useState(data.contact?.email ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [poNumber, setPoNumber] = useState(data.poNumber ?? "");
  const [editingPo, setEditingPo] = useState(false);
  const [poSaving, setPoSaving] = useState(false);
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [customAmountInput, setCustomAmountInput] = useState("");

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/history?eventId=${data.eventId}`);
      if (res.ok) {
        const rows = await res.json();
        setPayments(rows);
      }
    } catch {
      // silently fail
    } finally {
      setPaymentsLoading(false);
    }
  }, [data.eventId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // One allocation feeds every figure below, so the amount due, the schedule
  // badges and the history table cannot contradict each other.
  // See docs/specs/payment-accounting-truth.md.
  const allocation = useMemo(
    () =>
      allocatePayments(
        data.paymentSchedule,
        payments.map((p) => ({
          id: p.id,
          installmentId: p.installment_id ?? null,
          amountCents: p.amount_cents,
          currency: p.currency ?? "USD",
          status: p.status,
          paidAt: p.paid_at,
          createdAt: p.created_at,
          // The API never returns a deleted payment (docs/specs/accountant-quotes-08).
          deletedAt: null,
        })),
        currency,
      ),
    [data.paymentSchedule, payments, currency],
  );

  const today = todayDate();
  const { paidCents, remainingCents, overdueOwedCents, defaultPayCents } = useMemo(
    () => computeAmountDue({ allocation, totalCents: data.totalCents, today }),
    [allocation, data.totalCents, today],
  );

  const hasSchedule = data.paymentSchedule.length > 0;
  const totalDue = data.totalCents;

  const allocationById = useMemo(
    () => new Map(allocation.installments.map((i) => [i.installmentId, i])),
    [allocation],
  );

  // Custom amount in cents
  const customCents = Math.round((parseFloat(customAmountInput) || 0) * 100);
  const payAmountCents = useCustomAmount ? customCents : defaultPayCents;
  const payAmountValid = payAmountCents >= 50 && payAmountCents <= remainingCents;

  // Find the next unpaid installment to pass as metadata
  const nextUnpaidInstallment = data.paymentSchedule.find((i) => i.status !== "paid");

  async function handlePay() {
    if (!payerName.trim() || !payAmountValid) return;
    setIsLoading(true);
    setPayError(null);
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: data.eventId,
          installmentId: nextUnpaidInstallment?.id ?? undefined,
          amountCents: payAmountCents,
          // No currency: the server resolves it from the quote's sales office
          // and ignores anything sent here. See payment-accounting-truth.md §3.6.
          payerName: payerName.trim(),
          payerEmail: payerEmail.trim() || undefined,
          // Stripe renders its own checkout chrome — keep it in the client's language.
          language,
        }),
      });
      const json = await res.json();
      if (json.url) {
        track({
          action_type: "client_payment_started",
          field_name: "payment",
          next_value: formatMoney(payAmountCents),
        });
        window.location.href = json.url;
      } else {
        setPayError(json.error ?? s.payError);
      }
    } catch (e) {
      console.error("Checkout error:", e);
      setPayError(s.payError);
    } finally {
      setIsLoading(false);
    }
  }

  async function savePo() {
    setPoSaving(true);
    try {
      await fetch(`/api/events/${data.eventId}/po`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNumber }),
      });
      track({
        action_type: "client_po_submitted",
        field_name: "po_number",
        prev_value: data.poNumber ?? null,
        next_value: poNumber || null,
      });
      setEditingPo(false);
    } catch {
      // silently fail
    } finally {
      setPoSaving(false);
    }
  }

  // Read the ?payment= flag only after mount so server and first client render match
  // (reading window during render causes a hydration mismatch). A successful
  // payment redirects to its own confirmation page, so "cancelled" is the only
  // value that ever lands back here.
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  useEffect(() => {
    setPaymentStatus(new URLSearchParams(window.location.search).get("payment"));
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Cancel banner */}
      {paymentStatus === "cancelled" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-800">{s.paymentCancelled}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column — payment card + schedule */}
        <div className="md:col-span-2 space-y-6">
          {/* Amount Due Card */}
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{s.amountDue}</h3>
              <span className="text-2xl font-bold text-[#405daa]">
                {formatMoney(remainingCents)}
              </span>
            </div>

            {remainingCents <= 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">{s.paidInFull}</p>
              </div>
            ) : (
              <>
                {/* Overdue summary */}
                {hasSchedule && overdueOwedCents > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-800">
                    <strong>{formatMoney(overdueOwedCents)}</strong> {s.dueNoticeSuffix}
                  </div>
                )}

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {s.yourNameRequired}
                    </label>
                    <input
                      type="text"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-base sm:text-sm"
                      placeholder={s.fullNamePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {s.email}
                    </label>
                    <input
                      type="email"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-base sm:text-sm"
                      placeholder={s.emailPlaceholder}
                    />
                  </div>
                </div>

                {/* Payment amount toggle */}
                <div className="mb-4">
                  <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={!useCustomAmount}
                        onChange={() => setUseCustomAmount(false)}
                      />
                      {hasSchedule && overdueOwedCents > 0
                        ? s.payDueBalance(formatMoney(defaultPayCents))
                        : s.payAmount(formatMoney(defaultPayCents))}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={useCustomAmount}
                        onChange={() => setUseCustomAmount(true)}
                      />
                      {s.customAmount}
                    </label>
                  </div>

                  {useCustomAmount && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {currencySymbol(currency)}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        value={customAmountInput}
                        onChange={(e) =>
                          setCustomAmountInput(e.target.value.replace(/[^0-9.]/g, ""))
                        }
                        className="w-40 border rounded-md px-3 py-2 text-base sm:text-sm"
                        placeholder="0.00"
                      />
                      {customCents > 0 && customCents < 50 && (
                        <span className="text-xs text-red-600">
                          {s.minimumAmount(formatMoney(50))}
                        </span>
                      )}
                      {customCents > remainingCents && (
                        <span className="text-xs text-red-600">{s.exceedsBalance}</span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handlePay}
                  disabled={isLoading || !payerName.trim() || !payAmountValid}
                  className="w-full bg-[#405daa] hover:bg-[#10365a] disabled:opacity-40 text-white font-semibold text-base py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CreditCard className="w-5 h-5" />
                  {isLoading ? s.redirectingToStripe : s.payOnline(formatMoney(payAmountCents))}
                </button>

                {payError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                    <span>{payError}</span>
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-500 text-center">{s.alternativePayment}</p>
              </>
            )}
          </div>

          {/* Payment Schedule */}
          {data.paymentSchedule.length > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-4">{s.paymentSchedule}</h3>
              <div className="space-y-3">
                {data.paymentSchedule.map((inst, i) => {
                  const covered = allocationById.get(inst.id);
                  const status = covered?.status ?? inst.status;
                  const isPaid = status === "paid";
                  const isPartial = status === "partial";
                  const isOverdue = !isPaid && inst.dueDate <= today;
                  const isFirst = i === 0;
                  const isLast = i === data.paymentSchedule.length - 1;
                  let label = s.dueOn(formatDate(inst.dueDate));
                  if (isFirst) label = s.dueNow;
                  else if (isLast) label = s.finalDueOn(formatDate(inst.dueDate));

                  return (
                    <div
                      key={inst.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isPaid
                          ? "bg-green-50 border-green-200"
                          : isPartial
                            ? "bg-amber-50 border-amber-200"
                            : isOverdue
                              ? "bg-red-50 border-red-200"
                              : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isPaid ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : isPartial ? (
                          <Clock className="w-5 h-5 text-amber-600" />
                        ) : isOverdue ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          {isPaid && <p className="text-xs text-green-600">{s.paid}</p>}
                          {/* Part-paid rows say how much actually arrived; the
                              old badge called a $1 payment "paid". */}
                          {isPartial && (
                            <p className="text-xs text-amber-700">
                              {statusLabel(language, "partial")} —{" "}
                              {formatMoney(covered?.allocatedCents ?? 0)} /{" "}
                              {formatMoney(inst.amountCents)}
                            </p>
                          )}
                          {isOverdue && !isPartial && (
                            <p className="text-xs text-red-600">{s.due}</p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`font-semibold ${
                          isPaid ? "text-green-700" : isOverdue ? "text-red-700" : "text-gray-900"
                        }`}
                      >
                        {formatMoney(inst.amountCents)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                <span className="text-gray-600">{s.totalScheduled}</span>
                <span className="font-semibold">
                  {formatMoney(data.paymentSchedule.reduce((sum, i) => sum + i.amountCents, 0))}
                </span>
              </div>
            </div>
          )}

          {/* Payment History */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">{s.paymentHistory}</h3>
            {paymentsLoading ? (
              <p className="text-sm text-gray-500">{s.loading}</p>
            ) : payments.length === 0 ? (
              <p className="text-sm text-gray-500">{s.noPaymentsYet}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">{s.colDate}</th>
                      <th className="pb-2 font-medium">{s.colAmount}</th>
                      <th className="pb-2 font-medium">{s.colMethod}</th>
                      <th className="pb-2 font-medium">{s.colStatus}</th>
                      <th className="pb-2 font-medium">{s.colReceipt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2">{formatDate(p.paid_at ?? p.created_at)}</td>
                        <td className="py-2 font-medium">
                          {formatMoney(p.amount_cents, (p.currency ?? "USD") as "USD" | "CAD")}
                        </td>
                        <td className="py-2 capitalize">
                          {paymentMethodLabel(language, p.payment_method_type ?? "card")}
                        </td>
                        <td className="py-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.status === "succeeded"
                                ? "bg-green-100 text-green-700"
                                : p.status === "pending"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {p.status === "succeeded" && <Check className="w-3 h-3" />}
                            {statusLabel(language, p.status)}
                          </span>
                        </td>
                        <td className="py-2">
                          {p.stripe_receipt_url && (
                            <a
                              href={p.stripe_receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              {s.viewReceipt}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column — invoice summary + info */}
        <div className="space-y-6">
          {/* Invoice Summary */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {s.invoiceSummary}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{s.invoiceNumberLabel}</span>
                <span className="font-medium">{data.quoteNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{s.event}</span>
                <span className="font-medium text-right max-w-[160px] truncate">
                  {data.venue.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{s.total}</span>
                <span className="font-medium">{formatMoney(totalDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{s.paidLabel}</span>
                <span className="font-medium text-green-600">{formatMoney(paidCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-800 font-medium">{s.remaining}</span>
                <span className="font-bold text-[#405daa]">{formatMoney(remainingCents)}</span>
              </div>
            </div>
          </div>

          {/* PO Number */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{s.purchaseOrderNumber}</h3>
            {editingPo ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="flex-1 border rounded-md px-3 py-1.5 text-base sm:text-sm"
                  placeholder={s.enterPoNumber}
                  autoFocus
                />
                <button
                  onClick={savePo}
                  disabled={poSaving}
                  className="text-green-600 hover:text-green-700 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setPoNumber(data.poNumber ?? "");
                    setEditingPo(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{poNumber || s.notSet}</span>
                <button
                  onClick={() => setEditingPo(true)}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Make Checks Payable */}
          <div className="bg-gray-50 border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {s.makeChecksPayableToHeading}
            </h3>
            <p className="text-sm text-gray-600">{data.company.name}</p>
            {data.company.street && (
              <p className="text-sm text-gray-600">{`${data.company.street}, ${data.company.zip}`}</p>
            )}
            {/* {(data.company.city || data.company.state) && (
              <p className="text-sm text-gray-600">
                {data.company.city}, {data.company.state} {data.company.zip}
              </p>
            )} */}
          </div>

          {/* Contact */}
          <div className="bg-gray-50 border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{s.questions}</h3>
            <p className="text-sm text-gray-600">{data.company.email}</p>
            {data.company.phone && <p className="text-sm text-gray-600">{data.company.phone}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
