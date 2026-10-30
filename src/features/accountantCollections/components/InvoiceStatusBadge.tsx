import type { InvoiceStatus } from "../utils/invoiceStatus";

/**
 * The status in the header of the invoice page. Its rules live in `invoiceStatus`; this gives each
 * one its label and colour. docs/specs/accountant-collections-09-design.md §1.
 */

const STATUS_BADGE: Record<InvoiceStatus, { label: string; classes: string }> = {
  paid: { label: "Paid", classes: "bg-green-100 text-green-800" },
  schedule: { label: "Schedule", classes: "bg-purple-100 text-purple-800" },
  collections: { label: "Collections", classes: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", classes: "bg-gray-100 text-gray-700" },
  not_active: { label: "Not active yet", classes: "bg-gray-100 text-gray-700" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, classes } = STATUS_BADGE[status];
  return (
    <span
      title="Status is calculated from payments"
      className={`inline-flex h-9 items-center rounded-md px-3.5 text-sm font-semibold ${classes}`}
    >
      {label}
    </span>
  );
}
