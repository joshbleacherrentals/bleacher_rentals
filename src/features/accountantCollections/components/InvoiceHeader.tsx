import type { InvoiceStatus } from "../utils/invoiceStatus";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { OpenPdfButton } from "./OpenPdfButton";

/**
 * The header of the invoice page: the event, "N days overdue" (Collections only), Open PDF, Record
 * Payment and the status. There is no Send Email button.
 * docs/specs/accountant-collections-09-design.md §3 and accountant-collections-15-open-pdf.md §3.
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
}: {
  eventId: string;
  name: string;
  status: InvoiceStatus;
  daysOverdue: number | null;
  canRecordPayment: boolean;
  onRecordPayment: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 text-white">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h1 className="m-0 text-xl font-bold">{name}</h1>
        {status === "collections" && daysOverdue !== null && (
          <span className="text-sm font-semibold text-red-200">{overdueText(daysOverdue)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OpenPdfButton eventId={eventId} />
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
