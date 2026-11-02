import { Eye } from "lucide-react";
import type { InvoiceStatus } from "../utils/invoiceStatus";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { OpenPdfButton } from "./OpenPdfButton";

/**
 * The header of the invoice page: the event, "N days overdue" (Collections only), Open PDF, the
 * Customer view button, Record Payment and the status. There is no Send Email button.
 * docs/specs/accountant-collections-09-design.md §3, accountant-collections-15-open-pdf.md §3 and
 * accountant-collections-16-customer-page-view.md §3.
 */

function overdueText(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"} overdue`;
}

export function InvoiceHeader({
  eventId,
  name,
  status,
  daysOverdue,
  canRecordPayment,
  onRecordPayment,
  customerView,
  onToggleCustomerView,
}: {
  eventId: string;
  name: string;
  status: InvoiceStatus;
  daysOverdue: number | null;
  canRecordPayment: boolean;
  onRecordPayment: () => void;
  customerView: boolean;
  onToggleCustomerView: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-x-6 gap-y-3 px-6 py-4 text-white max-[820px]:flex-wrap">
      {/* Takes the room the buttons leave: a long name is cut with an ellipsis, never moved. */}
      <div className="flex min-w-0 flex-auto items-baseline gap-x-3.5 gap-y-1">
        <h1 className="m-0 min-w-0 truncate text-xl font-bold">{name}</h1>
        {status === "collections" && daysOverdue !== null && (
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-red-200">
            {overdueText(daysOverdue)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-[820px]:flex-wrap">
        <OpenPdfButton eventId={eventId} />
        <button
          type="button"
          aria-pressed={customerView}
          onClick={onToggleCustomerView}
          className={`inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium text-white ${
            customerView
              ? "border-lighterBlue bg-lightBlue hover:bg-lightBlue/90"
              : "border-white/55 bg-transparent hover:bg-white/10"
          }`}
        >
          <Eye className="size-4" aria-hidden />
          Customer view
        </button>
        {canRecordPayment && (
          <button
            type="button"
            onClick={onRecordPayment}
            className="h-9 rounded-md bg-white px-3.5 text-sm font-medium text-darkBlue hover:bg-gray-100"
          >
            Record Payment
          </button>
        )}
        <InvoiceStatusBadge status={status} />
      </div>
    </div>
  );
}
