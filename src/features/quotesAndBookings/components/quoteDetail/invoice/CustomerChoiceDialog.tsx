"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CustomerChoice,
  QboCustomerSummary,
} from "@/features/quickbooks-integration/customers";

/**
 * Several QuickBooks customers match the quote's contact and the app cannot tell which is right
 * (docs/specs/qbo-invoice-07-card-buttons.md §4). Closing it, by Cancel or by clicking outside, is a
 * Cancel: nothing is sent.
 */
export function CustomerChoiceDialog({
  candidates,
  onChoose,
  onCancel,
}: {
  candidates: QboCustomerSummary[];
  onChoose: (choice: CustomerChoice) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Which QuickBooks customer?</DialogTitle>
          <DialogDescription>
            More than one customer in QuickBooks matches this quote&apos;s contact. Pick the right
            one, or create a new customer.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded border text-sm">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <span className="block font-medium">{candidate.displayName}</span>
                {candidate.companyName && (
                  <span className="block text-gray-500">{candidate.companyName}</span>
                )}
                {candidate.email && <span className="block text-gray-500">{candidate.email}</span>}
              </div>
              <button
                type="button"
                onClick={() => onChoose({ kind: "existing", customerId: candidate.id })}
                className="shrink-0 rounded border border-darkBlue px-2 py-1 text-xs font-medium text-darkBlue hover:bg-blue-50"
              >
                Use this customer
              </button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onChoose({ kind: "new" })}
            className="text-sm px-3 py-1.5 border rounded"
          >
            Create a new customer
          </button>
          <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 border rounded">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
