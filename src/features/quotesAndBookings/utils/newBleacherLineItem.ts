import { LineItem } from "../types/quoteTypes";
import type { BleacherTypeOption } from "../hooks/useBleacherTypes";

/**
 * The line item a bleacher type becomes when it is added to a quote. The type's
 * description is copied now, so later edits to the type don't change this quote.
 * `priceCents` null (no matrix price) unlocks the price for manual entry.
 */
export function newBleacherLineItem(
  bt: Pick<BleacherTypeOption, "id" | "name" | "description">,
  priceCents: number | null,
): LineItem {
  return {
    id: crypto.randomUUID(),
    category: "bleachers",
    label: bt.name,
    bleacherTypeUuid: bt.id,
    qty: 1,
    unitPriceCents: priceCents ?? 0,
    lineTotalCents: priceCents ?? 0,
    overridePrice: priceCents === null,
    discountType: "percentage",
    discountValue: 0,
    description: bt.description,
  };
}
