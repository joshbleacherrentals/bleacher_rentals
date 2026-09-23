"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { QuoteDetail } from "../../../db/fetchQuoteDetail";
import { setEventIsQbo } from "../../../db/setEventIsQbo";
import { useEventIsQbo } from "../../../hooks/useEventIsQbo";
import { resolvePaymentSchedule } from "../../../utils/resolvePaymentSchedule";
import { usePaymentInstallments } from "../../../hooks/usePaymentInstallments";
import { usePaymentHistory, PaymentHistoryRow } from "../../../hooks/usePaymentHistory";
import { useEventCurrencyState } from "../../../hooks/useEventCurrency";
import { allocatePayments, type Allocation } from "../../../utils/allocatePayments";
import { formatMoney } from "../../../utils/formatMoney";
import { Currency } from "../../../types/quoteTypes";
import { formatDate, formatDateTime, formatTime } from "../../../utils/formatDate";
import { describeAppliedTo } from "../../../utils/describeAppliedTo";
import { paymentMethodLabel } from "../../../types/paymentTypes";
import { useUserNames } from "../../../hooks/useUserNames";
import dynamic from "next/dynamic";

// A modal most visits to this tab never open, carrying a date control and its
// own form state. It has no business in the tab's bundle.
const RecordPaymentDialog = dynamic(
  () => import("./RecordPaymentDialog").then((m) => m.RecordPaymentDialog),
  { ssr: false },
);

// Same reasoning as above: a read-only detail view nobody opens until they
// click a row.
const PaymentDetailDialog = dynamic(
  () => import("./PaymentDetailDialog").then((m) => m.PaymentDetailDialog),
  { ssr: false },
);

const STATUS_STYLES = {
  paid: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-yellow-100 text-yellow-800",
} as const;

const STATUS_LABELS = { paid: "Paid", partial: "Partial", unpaid: "Unpaid" } as const;

function PaymentScheduleTable({
  allocation,
  currency,
}: {
  allocation: Allocation;
  currency: Currency;
}) {
  if (allocation.installments.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center border rounded">
        No payment schedule set. Edit the quote to add installments.
      </p>
    );
  }

  const totalCents = allocation.installments.reduce((sum, i) => sum + i.amountCents, 0);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="py-2 font-medium">#</th>
            <th className="py-2 font-medium">Due Date</th>
            <th className="py-2 font-medium text-right">Amount</th>
            <th className="py-2 font-medium text-center">Status</th>
            <th className="py-2 font-medium">Paid At</th>
          </tr>
        </thead>
        <tbody>
          {allocation.installments.map((inst, i) => (
            <tr key={inst.installmentId} className="border-b">
              <td className="py-2 text-gray-400">{i + 1}</td>
              <td className="py-2">{formatDate(inst.dueDate)}</td>
              <td className="py-2 text-right font-medium">
                {formatMoney(inst.amountCents, currency)}
              </td>
              <td className="py-2 text-center">
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[inst.status]}`}>
                  {STATUS_LABELS[inst.status]}
                </span>
                {/* A partial row must say how far it actually got — this is the
                    number a $1.00 payment used to hide. */}
                {inst.status === "partial" && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatMoney(inst.allocatedCents, currency)} of{" "}
                    {formatMoney(inst.amountCents, currency)}
                  </div>
                )}
              </td>
              <td className="py-2 text-gray-500">
                {inst.paidAt ? formatDateTime(inst.paidAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col items-end gap-1 text-sm">
        <div className="flex gap-8">
          <span className="text-gray-500">Scheduled Total</span>
          <span className="font-medium w-24 text-right">{formatMoney(totalCents, currency)}</span>
        </div>
        <div className="flex gap-8 text-green-600">
          <span>Covered</span>
          <span className="font-medium w-24 text-right">
            {formatMoney(allocation.allocatedCents, currency)}
          </span>
        </div>
        <div className="flex gap-8 border-t pt-1 mt-1">
          <span className="font-semibold">Remaining</span>
          <span className="font-bold w-24 text-right">
            {formatMoney(totalCents - allocation.allocatedCents, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The compact reading of where a payment's money sits, for the ledger row.
 *
 * Stacked rather than run together on one line: "Due Sep 10 (C$11,675.00) ·
 * Due Sep 3 (C$662.50) · Unapplied (C$662.50)" is what forced the Applied To
 * column wide enough to squash every other column on the tab. Beyond two
 * pieces it stops enumerating and says how many are left — the full breakdown
 * is one click away in PaymentDetailDialog.
 */
const APPLIED_TO_PREVIEW_PARTS = 2;

function AppliedToCell({
  payment,
  allocation,
  currency,
}: {
  payment: PaymentHistoryRow;
  allocation: Allocation;
  currency: Currency;
}) {
  const applied = describeAppliedTo(payment, allocation);

  if (applied.kind === "excluded") {
    return applied.reason === "currency" ? (
      <span className="text-amber-700">Not counted ({payment.currency})</span>
    ) : (
      <span className="text-gray-400">Not counted ({payment.status})</span>
    );
  }
  if (applied.kind === "unapplied") {
    return <span className="text-gray-400">Unapplied</span>;
  }

  const lines: { key: string; label: string; cents: number | null; muted: boolean }[] =
    applied.parts.map((part) => ({
      key: part.installmentId,
      label: `Due ${formatDate(part.dueDate)}`,
      cents: applied.showAmounts ? part.cents : null,
      muted: false,
    }));

  if (applied.unallocatedCents !== 0) {
    lines.push({
      key: "unapplied",
      label: "Unapplied",
      cents: applied.unallocatedCents,
      muted: true,
    });
  }

  const shown = lines.slice(0, APPLIED_TO_PREVIEW_PARTS);
  const hidden = lines.length - shown.length;

  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((line) => (
        <span key={line.key} className={line.muted ? "text-gray-400" : "text-gray-600"}>
          {line.label}
          {line.cents !== null && (
            <span className="text-gray-400"> · {formatMoney(line.cents, currency)}</span>
          )}
        </span>
      ))}
      {hidden > 0 && <span className="text-gray-400">+{hidden} more</span>}
    </div>
  );
}

export function BillingTab({
  quote,
  contractTotalCents,
  canEdit,
}: {
  quote: QuoteDetail;
  contractTotalCents: number;
  canEdit: boolean;
}) {
  const { installments: terms, isLoading, error: scheduleError } = usePaymentInstallments(quote.id);
  const installments = useMemo(
    () => resolvePaymentSchedule(terms, Math.max(0, Math.round(contractTotalCents))),
    [terms, contractTotalCents],
  );
  const { payments, isLoading: paymentsLoading } = usePaymentHistory(quote.id);
  // Two answers, deliberately: the value paints the tab, the flag gates the
  // one place that writes it (§3.5, E5).
  const { currency, isResolved: currencyResolved } = useEventCurrencyState(quote.id);
  const storedIsQbo = useEventIsQbo(quote.id);
  const perms = usePermissionsStore();
  const staffNames = useUserNames();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);

  // A viewer is anyone who can read the page but holds neither of the roles the
  // RLS insert policy names. Showing them a button the server would refuse is
  // worse than showing nothing.
  const isViewer = !perms.isAdmin && !perms.isAccountManager;

  // Every figure on this tab comes from the money in PaymentHistory. The
  // schedule supplies only the terms — what is owed, and when.
  // See docs/specs/payment-accounting-truth.md.
  const allocation = useMemo(
    () => allocatePayments(installments, payments, currency),
    [installments, payments, currency],
  );

  // Held by id, not by value: the row keeps showing live data while the dialog
  // is open, and a payment that syncs away closes it instead of freezing a copy.
  const openPayment = payments.find((p) => p.id === openPaymentId) ?? null;

  const recordedByName = (p: PaymentHistoryRow) =>
    p.entrySource === "stripe" ? "Stripe" : (staffNames.get(p.recordedByUserUuid ?? "") ?? "Staff");

  const receivedCents = allocation.totalReceivedCents;
  const balanceDueCents = Math.max(0, contractTotalCents - receivedCents);
  const overpaidCents = Math.max(0, receivedCents - contractTotalCents);

  // Optimistic value: the write goes to the local DB and only then comes back
  // through the reactive query, which is enough of a round trip to look laggy.
  // We draw the user's own click immediately and drop the override once the DB
  // agrees (or the write fails).
  const [pendingIsQbo, setPendingIsQbo] = useState<boolean | null>(null);
  const isQbo = pendingIsQbo ?? storedIsQbo;

  useEffect(() => {
    if (pendingIsQbo !== null && pendingIsQbo === storedIsQbo) setPendingIsQbo(null);
  }, [pendingIsQbo, storedIsQbo]);

  // Writes are chained so that fast on/off/on clicking cannot land out of order
  // and leave the row disagreeing with the box.
  const qboWriteQueue = useRef<Promise<unknown>>(Promise.resolve());

  const handleQboChange = (checked: boolean) => {
    setPendingIsQbo(checked);
    qboWriteQueue.current = qboWriteQueue.current
      .then(() =>
        setEventIsQbo({
          eventId: quote.id,
          isQbo: checked,
          currentUserUuid: perms.userId,
        }),
      )
      .catch((err: any) => {
        setPendingIsQbo(null); // fall back to whatever the DB actually holds
        createErrorToast(["Failed to update the QuickBooks flag.", err?.message ?? ""]);
      });
  };

  return (
    <div className="space-y-6">
      {allocation.foreignCurrencyPayments.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 text-sm rounded p-3">
          {allocation.foreignCurrencyPayments.length === 1 ? "1 payment" : "Some payments"} in{" "}
          {[...new Set(allocation.foreignCurrencyPayments.map((p) => p.currency))].join(", ")}{" "}
          {allocation.foreignCurrencyPayments.length === 1 ? "is" : "are"} not included in this
          balance, which is in {currency}. Reconcile them by hand.
        </div>
      )}

      {/* Payment Summary */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Payment Summary
        </h3>
        <div className="space-y-2 text-sm max-w-md">
          <div className="flex justify-between">
            <span>Contract Total</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{formatMoney(contractTotalCents, currency)}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  quote.eventStatus === "booked"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {quote.eventStatus ?? "Draft"}
              </span>
            </div>
          </div>
          {/* Never clamped (§6.5), so it has to be legible going the other
              way: refunds exceeding receipts is a real state, and a minus sign
              inside a green figure is not how anyone reads money. */}
          <div
            className={`flex justify-between ${receivedCents < 0 ? "text-red-600" : "text-green-600"}`}
          >
            <span>Payments Received</span>
            <span className="font-semibold">{formatMoney(receivedCents, currency)}</span>
          </div>
          <div className="flex justify-between text-red-600 border-t pt-2">
            <span className="font-medium">Balance Due</span>
            <span className="font-bold">{formatMoney(balanceDueCents, currency)}</span>
          </div>
          {overpaidCents > 0 && (
            <div className="flex justify-between text-amber-700">
              <span className="font-medium">Overpaid by</span>
              <span className="font-bold">{formatMoney(overpaidCents, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* QuickBooks */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">QuickBooks</h3>
        {/*
          Gated on role, not on `canEdit`. Bookkeeping is not the quote owner's
          job: whoever enters the invoice into QuickBooks ticks the box, on
          anyone's quote (owner's call, 2026-09-03). That matches `events_update`,
          which already lets any admin or account manager write this column, so
          the box no longer promises a limit the database does not keep.
          Viewers still see the state and cannot change it.
        */}
        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <Checkbox
            checked={isQbo}
            disabled={isViewer}
            onCheckedChange={(checked) => handleQboChange(checked === true)}
          />
          <span className={isViewer ? "text-gray-400" : ""}>QuickBooks Invoice</span>
        </label>
      </div>

      {/* Payment Schedule */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Payment Schedule
        </h3>
        {scheduleError ? (
          <p role="alert">Could not load the payment schedule. Please try again.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading payment schedule...</p>
        ) : (
          <PaymentScheduleTable allocation={allocation} currency={currency} />
        )}
      </div>

      {/* Payment History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Payment History
          </h3>
          {/* A viewer is not shown a control they could never use. Everyone
              else sees it, enabled on the same terms as every other edit on
              this page — which means a lead AM may record a payment on a quote
              they did not create. */}
          {!isViewer && (
            <button
              onClick={() => setDialogOpen(true)}
              disabled={!canEdit}
              title={
                canEdit
                  ? "Record a check, ACH or manual card payment"
                  : "You can only record a payment on quotes you created."
              }
              className={
                canEdit
                  ? "text-xs font-medium text-darkBlue border border-darkBlue rounded px-2 py-1 hover:bg-blue-50"
                  : "text-xs font-medium text-gray-400 border border-gray-300 rounded px-2 py-1 cursor-not-allowed"
              }
            >
              + Record Payment
            </button>
          )}
        </div>
        {paymentsLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading payments...</p>
        ) : payments.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Payer</th>
                  <th className="px-3 py-2 font-medium">Applied To</th>
                  <th className="px-3 py-2 font-medium text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  /* The whole row is the affordance — a payment has more to it
                     than fits here, and there is nothing else a click could
                     mean on a ledger nobody may edit. */
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-label={`Payment details for ${formatMoney(p.amountCents, p.currency as Currency)} from ${p.payerName}`}
                    onClick={() => setOpenPaymentId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenPaymentId(p.id);
                      }
                    }}
                    className="cursor-pointer align-top hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block text-gray-900">
                        {formatDate(p.paidAt ?? p.createdAt)}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {formatTime(p.paidAt ?? p.createdAt)}
                      </span>
                    </td>
                    {/* Money out is red with an explicit minus sign — never bare
                        parentheses, which are easy to miss at a glance. */}
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${
                        p.amountCents < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {formatMoney(p.amountCents, p.currency as Currency)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block text-gray-700 whitespace-nowrap">
                        {paymentMethodLabel(p.paymentMethodType, p.entrySource)}
                      </span>
                      {p.reference && (
                        <span className="block text-xs text-gray-400">{p.reference}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block text-gray-700">{p.payerName}</span>
                      {/* Who keyed it in is a footnote to the payer, not a
                          column of its own — it cost width the amounts needed. */}
                      <span className="block text-xs text-gray-400">via {recordedByName(p)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <AppliedToCell payment={p} allocation={allocation} currency={currency} />
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-darkBlue underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center border rounded">
            No payments recorded yet.
          </p>
        )}
        {/* Said once, plainly, because it will be the first question: there is
            no edit or delete on a payment row, on purpose. */}
        <p className="text-xs text-gray-400 mt-2">
          Payments cannot be edited or deleted. To correct one, record a negative amount — both
          entries stay visible.
        </p>
      </div>

      {openPayment && (
        <PaymentDetailDialog
          open={true}
          onOpenChange={(open) => !open && setOpenPaymentId(null)}
          payment={openPayment}
          allocation={allocation}
          currency={currency}
          recordedBy={recordedByName(openPayment)}
        />
      )}

      {dialogOpen && (
        <RecordPaymentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          eventId={quote.id}
          currency={currency}
          currencyResolved={currencyResolved}
          installments={allocation.installments}
          defaultPayerName={
            [quote.contact?.firstName, quote.contact?.lastName].filter(Boolean).join(" ") || ""
          }
          recordedByUserUuid={perms.userId}
        />
      )}
    </div>
  );
}
