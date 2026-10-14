"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "../../../utils/formatMoney";
import type { PriceChange } from "../../../utils/linePrice";
import type { Currency } from "../../../types/quoteTypes";

type ListProps = {
  changes: PriceChange[];
  currency: Currency;
  totalBeforeCents: number;
  totalAfterCents: number;
};

/** The prices a person is asked to approve: each changed line, then the total it moves. */
export function PriceChangeList({
  changes,
  currency,
  totalBeforeCents,
  totalAfterCents,
}: ListProps) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="divide-y rounded border">
        {changes.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-4 px-3 py-2">
            <span className="min-w-0">
              <span className="block break-words font-medium">{c.label}</span>
              {!c.isDiscount && <span className="text-xs text-gray-500">× {c.qty}</span>}
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              <span className="text-gray-500">{formatMoney(c.beforeCents, currency)}</span>
              {" → "}
              <span className="font-semibold">{formatMoney(c.afterCents, currency)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-4 rounded bg-gray-50 px-3 py-2">
        <span className="text-gray-600">Line items total (before tax)</span>
        <span className="whitespace-nowrap tabular-nums">
          <span className="text-gray-500">{formatMoney(totalBeforeCents, currency)}</span>
          {" → "}
          <span className="font-semibold">{formatMoney(totalAfterCents, currency)}</span>
        </span>
      </div>
    </div>
  );
}

type Props = ListProps & {
  open: boolean;
  /** Go ahead and save with these prices. */
  onConfirm: () => void;
  /** Do not save; stay on the quote. */
  onCancel: () => void;
};

/**
 * Shown before a quote that already exists is saved with prices different from the saved ones, so a
 * price never changes without someone having seen it.
 */
export function PriceChangeDialog({ open, onConfirm, onCancel, ...list }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:w-fit sm:min-w-[32rem] sm:max-w-[min(90vw,48rem)]">
        <DialogHeader>
          <DialogTitle>Prices have changed</DialogTitle>
          {/* Capped so this paragraph does not by itself stretch the dialog to its maximum width. */}
          <DialogDescription className="max-w-md">
            These prices are different from what is saved on this quote. Are you sure you want to
            save this change with a different price?
          </DialogDescription>
        </DialogHeader>
        <PriceChangeList {...list} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Go back
          </Button>
          <Button onClick={onConfirm}>Save with new prices</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
