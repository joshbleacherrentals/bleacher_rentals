"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExistingInvoice } from "@/features/quickbooks-integration/invoice/qboInvoiceApi";
import type { Currency } from "../../../types/quoteTypes";
import { formatMoney } from "../../../utils/formatMoney";

/**
 * The quote's invoice number is already taken by an invoice in QuickBooks: the user is told, and a
 * button overwrites it anyway (docs/specs/qbo-invoice-07-card-buttons.md §4). Closing it, by Cancel
 * or by clicking outside, is a Cancel: nothing is sent.
 */
export function InvoiceNumberExistsDialog({
  invoice,
  currency,
  onOverwrite,
  onCancel,
}: {
  invoice: ExistingInvoice;
  currency: Currency;
  onOverwrite: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invoice number already in QuickBooks</DialogTitle>
          <DialogDescription>
            An invoice numbered {invoice.number} already exists in QuickBooks (customer{" "}
            {invoice.customerName}, total {formatMoney(invoice.totalCents, currency)}).
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 border rounded">
            Cancel
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            className="text-sm px-3 py-1.5 rounded text-white bg-darkBlue"
          >
            Overwrite with this quote&apos;s data
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
