import type { LineItem } from "../types/quoteTypes";
import { calculateTotals } from "./calculateTotals";

/**
 * What the price cell of a bleacher line shows and does.
 *
 * A line is either hand-priced (`overridePrice`) or following the pricing matrix. That is saved with
 * the line, so it means the same thing every time the quote is opened: a hand-priced line keeps its
 * price until the person resets it, a matrix-following line always has the matrix price
 * (`matrixPriceUpdates`). Save asks before storing any price that differs from what is saved
 * (`findPriceChanges`).
 */
export type PriceControl = {
  /** The price can be typed into. */
  editable: boolean;
  /** What the cell's button does: "edit" unlocks the price for typing, "reset" restores the matrix. */
  action: "edit" | "reset";
  /** "reset" is possible: the matrix has a price for this bleacher, event type and dates. */
  canReset: boolean;
};

export function priceControl(
  item: Pick<LineItem, "overridePrice">,
  matrixCents: number | null,
): PriceControl {
  if (item.overridePrice) {
    return { editable: true, action: "reset", canReset: matrixCents !== null };
  }
  return { editable: false, action: "edit", canReset: false };
}

/** The explicit reset: take the matrix price and go back to following it. */
export function withMatrixPrice(item: LineItem, matrixCents: number): LineItem {
  return {
    ...item,
    overridePrice: false,
    unitPriceCents: matrixCents,
    lineTotalCents: matrixCents * item.qty,
  };
}

/** Unlock the price for typing. The price stays what it is until the person changes it. */
export function withManualPrice(item: LineItem): LineItem {
  return { ...item, overridePrice: true };
}

export type LinePriceUpdate = Pick<LineItem, "id" | "unitPriceCents" | "lineTotalCents">;

/**
 * The re-pricing a quote needs when the event type, dates, currency or pricing data change: every
 * matrix-following bleacher line takes the matrix price. A hand-priced line is never in the result,
 * and neither is a line the matrix has no price for.
 */
export function matrixPriceUpdates(
  items: LineItem[],
  matrixPriceFor: (item: LineItem) => number | null,
): LinePriceUpdate[] {
  const updates: LinePriceUpdate[] = [];
  for (const item of items) {
    if (item.category !== "bleachers" || !item.bleacherTypeUuid || item.overridePrice) continue;
    const matrixCents = matrixPriceFor(item);
    if (matrixCents === null || matrixCents === item.unitPriceCents) continue;
    updates.push({
      id: item.id,
      unitPriceCents: matrixCents,
      lineTotalCents: matrixCents * item.qty,
    });
  }
  return updates;
}

export type PriceChange = {
  id: string;
  label: string;
  qty: number;
  /** Per unit; a discount's whole amount. */
  beforeCents: number;
  afterCents: number;
  isDiscount: boolean;
};

/** What the price of a line is, as saved: a discount is its amount, anything else its unit price. */
function savedPrice(item: LineItem): number {
  return item.category === "discounts" ? item.lineTotalCents : item.unitPriceCents;
}

/** Same line, compared when an id is not enough: what it is, not which row it is. */
function lineKey(item: LineItem): string {
  return `${item.label}|${item.bleacherTypeUuid ?? ""}`;
}

/**
 * Lines of `current` whose price differs from the same line in `stored`. A new line, a removed
 * line and a changed quantity are not price changes.
 *
 * Lines are matched by id. Saving a quote re-inserts its lines under new ids, so a form kept open
 * after a save (Preview, Send) holds ids the database no longer has; those are matched by label
 * and bleacher type, in order, among the stored lines no id claimed.
 */
export function findPriceChanges(stored: LineItem[], current: LineItem[]): PriceChange[] {
  const storedById = new Map(stored.map((s) => [s.id, s]));
  const claimed = new Set<string>();
  const matches = new Map<string, LineItem>();

  for (const item of current) {
    const hit = storedById.get(item.id);
    if (hit) {
      matches.set(item.id, hit);
      claimed.add(hit.id);
    }
  }
  for (const item of current) {
    if (matches.has(item.id)) continue;
    const hit = stored.find((s) => !claimed.has(s.id) && lineKey(s) === lineKey(item));
    if (hit) {
      matches.set(item.id, hit);
      claimed.add(hit.id);
    }
  }

  const changes: PriceChange[] = [];
  for (const item of current) {
    const before = matches.get(item.id);
    if (!before || savedPrice(before) === savedPrice(item)) continue;
    changes.push({
      id: item.id,
      label: item.label,
      qty: item.qty,
      beforeCents: savedPrice(before),
      afterCents: savedPrice(item),
      isDiscount: item.category === "discounts",
    });
  }
  return changes;
}

export type PriceReview = {
  changes: PriceChange[];
  /** The line items' total before tax, as saved and as about to be saved. */
  totalBeforeCents: number;
  totalAfterCents: number;
};

export function summarizePriceReview(stored: LineItem[], current: LineItem[]): PriceReview {
  return {
    changes: findPriceChanges(stored, current),
    totalBeforeCents: calculateTotals(stored, 0).taxableAmount,
    totalAfterCents: calculateTotals(current, 0).taxableAmount,
  };
}
