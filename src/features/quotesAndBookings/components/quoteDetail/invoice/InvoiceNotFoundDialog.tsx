"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The invoice linked to the quote is gone from QuickBooks (docs/specs/qbo-invoice-07-card-buttons.md
 * §4). Yes makes a new one; No is an answer of its own, which tells the user it is probably a bug.
 * Closing the window by clicking outside is a Cancel, not a No: nothing is sent and nothing is said.
 */
export function InvoiceNotFoundDialog({
  onYes,
  onNo,
  onCancel,
}: {
  onYes: () => void;
  onNo: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invoice not found in QuickBooks</DialogTitle>
          <DialogDescription>
            The invoice linked to this quote was not found in QuickBooks. Create a new one?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onNo} className="text-sm px-3 py-1.5 border rounded">
            No
          </button>
          <button
            type="button"
            onClick={onYes}
            className="text-sm px-3 py-1.5 rounded text-white bg-darkBlue"
          >
            Yes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
