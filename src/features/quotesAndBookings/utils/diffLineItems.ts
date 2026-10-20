import type { Currency, LineItem } from "../types/quoteTypes";
import { toEventLineItemValues } from "../db/toEventLineItemValues";

/**
 * What a Save has to write to turn a quote's line item rows into the form's items. Spec:
 * docs/specs/quote-detail-04-line-items-local.md.
 *
 * Compared by id. A form item keeps the id of the row it was loaded from, and an item added in the
 * form has the id it got when it was added, so a row is "the same item" when the ids match. Only
 * what differs is written: an unchanged item costs no statement, which also means it moves no hash
 * on the server and invalidates no signature.
 */

/** The columns of an `EventLineItems` row that a Save writes, plus its id. */
export type ExistingLineItem = {
  id: string;
  header: string | null;
  description: string | null;
  bleacher_type_uuid: string | null;
  value_cents: number | null;
  quantity: number | null;
  currency: string | null;
  is_price_overridden: number | null;
};

export type LineItemWrite = {
  id: string;
  values: ReturnType<typeof toEventLineItemValues>;
};

export type LineItemDiff = {
  /** Ids of rows the form no longer has, in the order of `existing`. */
  toDelete: string[];
  /** Items whose row differs, in the order of the form. */
  toUpdate: LineItemWrite[];
  /** Items with no row yet, in the order of the form. */
  toInsert: LineItemWrite[];
};

/**
 * Whether the row already holds these values. Strict on every column but one: a row saved without
 * the override flag is read as overridden, the way the editor reads it (only an explicit 0 means
 * "follows the price matrix"), so it is the same as an overridden item.
 */
function isSame(row: ExistingLineItem, values: LineItemWrite["values"]): boolean {
  return (
    row.header === values.header &&
    row.description === values.description &&
    row.bleacher_type_uuid === values.bleacher_type_uuid &&
    row.value_cents === values.value_cents &&
    row.quantity === values.quantity &&
    row.currency === values.currency &&
    (row.is_price_overridden !== 0) === values.is_price_overridden
  );
}

export function diffLineItems(
  existing: ExistingLineItem[],
  items: LineItem[],
  eventId: string,
  currency: Currency,
): LineItemDiff {
  const rowById = new Map(existing.map((row) => [row.id, row]));
  const formIds = new Set(items.map((li) => li.id));

  const toUpdate: LineItemWrite[] = [];
  const toInsert: LineItemWrite[] = [];

  for (const li of items) {
    const values = toEventLineItemValues(li, eventId, currency);
    const row = rowById.get(li.id);
    if (!row) toInsert.push({ id: li.id, values });
    else if (!isSame(row, values)) toUpdate.push({ id: li.id, values });
  }

  return {
    toDelete: existing.filter((row) => !formIds.has(row.id)).map((row) => row.id),
    toUpdate,
    toInsert,
  };
}
