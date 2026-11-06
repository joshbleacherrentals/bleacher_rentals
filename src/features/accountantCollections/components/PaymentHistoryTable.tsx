"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import type { Allocation } from "@/features/quotesAndBookings/utils/allocatePayments";
import { buildPaymentRows } from "../utils/invoiceView";

/**
 * The Payment History section, wired as the Billing tab wires it: a click on any row opens the
 * payment detail dialog, and Edit and Delete are in that dialog, not in the rows. The dialogs are
 * loaded on demand, like there. docs/specs/accountant-collections-09-design.md §3.
 */

const RecordPaymentDialog = dynamic(
  () =>
    import("@/features/quotesAndBookings/components/quoteDetail/tabs/RecordPaymentDialog").then(
      (m) => m.RecordPaymentDialog,
    ),
  { ssr: false },
);
const PaymentDetailDialog = dynamic(
  () =>
    import("@/features/quotesAndBookings/components/quoteDetail/tabs/PaymentDetailDialog").then(
      (m) => m.PaymentDetailDialog,
    ),
  { ssr: false },
);
const DeletePaymentDialog = dynamic(
  () =>
    import("@/features/quotesAndBookings/components/quoteDetail/tabs/DeletePaymentDialog").then(
      (m) => m.DeletePaymentDialog,
    ),
  { ssr: false },
);

const TH = "border-b border-gray-200 p-2 font-medium";

export function PaymentHistoryTable({
  eventId,
  payments,
  allocation,
  currency,
  timezone,
  staffNames,
  canRecordPayment,
  recordedByUserUuid,
  onRecordPayment,
  initiallyShowDeleted = false,
  initiallyOpenPaymentId = null,
}: {
  eventId: string;
  /** Every payment row, deleted ones too. */
  payments: readonly PaymentHistoryRow[];
  allocation: Allocation;
  currency: Currency;
  timezone: string;
  staffNames: ReadonlyMap<string, string>;
  /** `can.recordPayment`: Record Payment, and Edit and Delete inside the dialog. */
  canRecordPayment: boolean;
  recordedByUserUuid: string | null;
  onRecordPayment: () => void;
  /** Where the Show deleted switch starts. Off, unless a test says otherwise. */
  initiallyShowDeleted?: boolean;
  /** The payment whose dialog starts open. Closed, unless a test says otherwise. */
  initiallyOpenPaymentId?: string | null;
}) {
  const [showDeleted, setShowDeleted] = useState(initiallyShowDeleted);
  // Held by id, not by value: the dialog shows live data, and a payment that syncs away closes it.
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(initiallyOpenPaymentId);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const rows = useMemo(
    () => buildPaymentRows(payments, showDeleted, timezone),
    [payments, showDeleted, timezone],
  );

  const openPayment = payments.find((p) => p.id === openPaymentId) ?? null;
  const editingPayment = payments.find((p) => p.id === editingPaymentId) ?? null;
  const deletingPayment = payments.find((p) => p.id === deletingPaymentId) ?? null;

  const recordedByName = (p: PaymentHistoryRow) =>
    p.entrySource === "stripe" ? "Stripe" : (staffNames.get(p.recordedByUserUuid ?? "") ?? "Staff");
  const deletedByName = (p: PaymentHistoryRow) =>
    staffNames.get(p.deletedByUserUuid ?? "") ?? "Staff";

  return (
    <section
      aria-label="Payment History"
      className="rounded-[10px] border border-gray-200 bg-white p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Payment History
        </h3>
        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={showDeleted}
            onClick={() => setShowDeleted((on) => !on)}
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-600"
          >
            <span>Show deleted</span>
            <span
              className={`relative inline-flex h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${
                showDeleted ? "bg-darkBlue" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none mt-[2px] inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform ${
                  showDeleted ? "translate-x-[20px]" : "translate-x-[2px]"
                }`}
              />
            </span>
          </button>
          {canRecordPayment && (
            <button
              type="button"
              onClick={onRecordPayment}
              title="Record a check, ACH or manual card payment"
              className="h-8 rounded-md border border-darkBlue bg-white px-3 text-sm font-medium text-darkBlue hover:bg-blue-50"
            >
              Record payment
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className={`${TH} w-10 pl-0`}>
                  #
                </th>
                <th scope="col" className={TH}>
                  Date
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Amount
                </th>
                <th scope="col" className={TH}>
                  Method
                </th>
                <th scope="col" className={`${TH} pr-0`}>
                  Payer
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = () => setOpenPaymentId(row.id);
                return (
                  // The whole row is the affordance, as on the Billing tab.
                  <tr
                    key={row.id}
                    tabIndex={0}
                    aria-label={`Payment details for ${row.amount} from ${row.payer}`}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open();
                      }
                    }}
                    className={`cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none ${
                      row.isDeleted ? "text-gray-500" : ""
                    }`}
                  >
                    <td className="py-3 pr-2 text-gray-500">{row.number}</td>
                    <td className="p-3">
                      <span className="block">{row.date}</span>
                      <span className="block text-xs text-gray-500">{row.time}</span>
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      <span className={row.isDeleted ? "line-through" : ""}>{row.amount}</span>
                      {row.isDeleted && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-px text-xs font-medium text-red-700">
                          Deleted
                        </span>
                      )}
                    </td>
                    <td className="p-3">{row.method}</td>
                    <td className="py-3 pl-2">{row.payer}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">Stripe payments cannot be edited or deleted.</p>

      {openPayment && (
        <PaymentDetailDialog
          open={true}
          onOpenChange={(open: boolean) => !open && setOpenPaymentId(null)}
          payment={openPayment}
          allocation={allocation}
          currency={currency}
          recordedBy={recordedByName(openPayment)}
          canWrite={canRecordPayment}
          deletedBy={deletedByName(openPayment)}
          onEdit={() => {
            setEditingPaymentId(openPayment.id);
            setOpenPaymentId(null);
          }}
          onDelete={() => {
            setDeletingPaymentId(openPayment.id);
            setOpenPaymentId(null);
          }}
        />
      )}

      {editingPayment && (
        <RecordPaymentDialog
          open={true}
          onOpenChange={(open: boolean) => !open && setEditingPaymentId(null)}
          mode="edit"
          payment={editingPayment}
          eventId={eventId}
          currency={currency}
          // The page is not drawn until the currency is resolved (`useInvoiceData`).
          currencyResolved={true}
          installments={allocation.installments}
          defaultPayerName={editingPayment.payerName}
          recordedByUserUuid={recordedByUserUuid}
        />
      )}

      {deletingPayment && (
        <DeletePaymentDialog
          open={true}
          onOpenChange={(open: boolean) => !open && setDeletingPaymentId(null)}
          eventId={eventId}
          payment={deletingPayment}
          deletedByUserUuid={recordedByUserUuid}
        />
      )}
    </section>
  );
}
