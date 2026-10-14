import { Currency, LineItem } from "../types/quoteTypes";

/**
 * The columns an `EventLineItems` row gets from a quote line item. Shared by the
 * create (local PowerSync) and update (Supabase) writers, which each add their
 * own `id`, `is_template` and `deleted` in the shape their client expects.
 *
 * `is_price_overridden` is a boolean here (the Supabase writer's shape); the local PowerSync writer
 * stores booleans as 0/1 and converts it.
 */
export function toEventLineItemValues(li: LineItem, eventUuid: string, currency: Currency) {
  return {
    event_uuid: eventUuid,
    header: li.label,
    // Persisted drafts from before descriptions existed have no field at all.
    description: li.description ?? null,
    bleacher_type_uuid: li.bleacherTypeUuid || null,
    value_cents: li.category === "discounts" ? li.lineTotalCents : li.unitPriceCents,
    quantity: li.qty,
    currency,
    // Remembered so a hand-set price is never re-priced from the matrix. A draft saved before the
    // flag existed has none; keeping its price is the safe reading.
    is_price_overridden: li.overridePrice !== false,
  };
}
