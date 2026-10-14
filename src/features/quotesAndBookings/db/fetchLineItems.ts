import { db } from "@/components/providers/SystemProvider";
import { typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { LineItem, LineItemCategory } from "../types/quoteTypes";

type Row = {
  id: string;
  header: string | null;
  bleacher_type_uuid: string | null;
  quantity: number | null;
  value_cents: number | null;
  description: string | null;
  /** 0/1. Whether the price was typed by hand; null only for a row synced without the column. */
  is_price_overridden: number | null;
};

export function inferCategory(
  row: Omit<Row, "description" | "is_price_overridden">,
): LineItemCategory {
  if (row.bleacher_type_uuid) return "bleachers";
  const cents = row.value_cents ?? 0;
  if (cents < 0) return "discounts";
  return "custom_service";
}

export async function fetchLineItemsForEvent(eventUuid: string): Promise<LineItem[]> {
  const compiled = db
    .selectFrom("EventLineItems")
    .select([
      "id",
      "header",
      "bleacher_type_uuid",
      "quantity",
      "value_cents",
      "description",
      "is_price_overridden",
    ])
    .where("event_uuid", "=", eventUuid)
    .where("deleted", "=", 0)
    .orderBy("created_at", "asc")
    .compile();

  const rows = await typedGetAll(compiled, expect<Row>());

  return rows.map(toLineItem);
}

export function toLineItem(r: Row): LineItem {
  const category = inferCategory(r);
  const qty = r.quantity ?? 1;
  const valueCents = r.value_cents ?? 0;
  // Only an explicit 0 means "follows the matrix". Anything else keeps the saved price.
  const overridePrice = r.is_price_overridden !== 0;

  if (category === "discounts") {
    return {
      id: r.id,
      category,
      label: r.header ?? "",
      bleacherTypeUuid: null,
      qty: 1,
      unitPriceCents: 0,
      lineTotalCents: valueCents,
      overridePrice,
      discountType: "fixed" as const,
      discountValue: Math.abs(valueCents) / 100,
      description: r.description,
    };
  }

  return {
    id: r.id,
    category,
    label: r.header ?? "",
    bleacherTypeUuid: r.bleacher_type_uuid ?? null,
    qty,
    unitPriceCents: valueCents,
    lineTotalCents: qty * valueCents,
    overridePrice,
    discountType: "fixed" as const,
    discountValue: 0,
    description: r.description,
  };
}
