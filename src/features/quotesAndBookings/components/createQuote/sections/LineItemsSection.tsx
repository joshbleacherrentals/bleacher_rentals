"use client";

import { useEffect, useMemo } from "react";
import { X, Lock, Unlock, CheckCircle, TriangleAlert } from "lucide-react";
import { formatMoney } from "../../../utils/formatMoney";
import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { usePriceLookup } from "../../../hooks/usePriceLookup";
import { Dropdown } from "@/components/DropDown";
import { LineItem, DiscountType } from "../../../types/quoteTypes";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { AppTooltip } from "@/components/AppTooltip";
import { LineItemDescription } from "../../LineItemDescription";

const discountTypeOptions = [
  { label: "%", value: "percentage" as DiscountType },
  { label: "$", value: "fixed" as DiscountType },
];

const CATEGORY_LABELS: Record<string, string> = {
  bleachers: "Bleachers",
  discounts: "Discounts",
  logistics: "Logistics",
  custom_service: "Services",
};

function recalcLineTotal(item: LineItem, subtotalCents: number): number {
  if (item.category === "discounts") {
    if (item.discountType === "percentage") {
      return -Math.round(subtotalCents * (item.discountValue / 100));
    }
    return -Math.abs(item.discountValue);
  }
  return item.unitPriceCents * item.qty;
}

export function LineItemsSection() {
  const lineItems = useCreateQuoteStore((s) => s.lineItems);
  const currency = useCreateQuoteStore((s) => s.currency);
  const eventTypeId = useCreateQuoteStore((s) => s.eventTypeId);
  const eventStart = useCreateQuoteStore((s) => s.eventStart);
  const eventEnd = useCreateQuoteStore((s) => s.eventEnd);
  const updateLineItem = useCreateQuoteStore((s) => s.updateLineItem);
  const removeLineItem = useCreateQuoteStore((s) => s.removeLineItem);
  const setField = useCreateQuoteStore((s) => s.setField);
  const editingEventId = useCreateQuoteStore((s) => s.editingEventId);

  const assignedBleachersQuery = useMemo(
    () =>
      editingEventId
        ? db
            .selectFrom("BleacherEvents as be")
            .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
            .select(["b.bleacher_type_uuid as bleacher_type_uuid"])
            .where("be.event_uuid", "=", editingEventId)
            .compile()
        : null,
    [editingEventId],
  );
  const { data: assignedRows } = useTypedQuery(
    assignedBleachersQuery ??
      db.selectFrom("Bleachers").select(["bleacher_type_uuid"]).where("id", "=", "").compile(),
    expect<{ bleacher_type_uuid: string | null }>(),
  );

  const assignedCountByType = useMemo(() => {
    if (!editingEventId) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const row of assignedRows ?? []) {
      if (!row.bleacher_type_uuid) continue;
      counts[row.bleacher_type_uuid] = (counts[row.bleacher_type_uuid] ?? 0) + 1;
    }
    return counts;
  }, [assignedRows, editingEventId]);

  const { lookupPrice } = usePriceLookup();

  // Auto-recalc bleacher prices when event type, dates, or currency change
  useEffect(() => {
    if (!eventTypeId || !eventStart || !eventEnd) return;

    for (const item of lineItems) {
      if (item.category !== "bleachers" || !item.bleacherTypeUuid || item.overridePrice) continue;

      const priceCents = lookupPrice(
        item.bleacherTypeUuid,
        eventTypeId,
        eventStart,
        eventEnd,
        currency,
      );
      if (priceCents !== null && priceCents !== item.unitPriceCents) {
        const updated = {
          ...item,
          unitPriceCents: priceCents,
          lineTotalCents: priceCents * item.qty,
        };
        updateLineItem(item.id, updated);
      }
    }
  }, [eventTypeId, eventStart, eventEnd, currency]);

  const subtotalCents = lineItems
    .filter((i) => i.category !== "discounts")
    .reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);

  const handleUpdate = (id: string, changes: Partial<LineItem>) => {
    const item = lineItems.find((i) => i.id === id);
    if (!item) return;

    const updated = { ...item, ...changes };
    updated.lineTotalCents = recalcLineTotal(updated, subtotalCents);
    updateLineItem(id, updated);
  };

  const togglePriceOverride = (item: LineItem) => {
    if (item.overridePrice) {
      // Unlocking — try to restore price from matrix
      if (item.bleacherTypeUuid && eventTypeId && eventStart && eventEnd) {
        const priceCents = lookupPrice(
          item.bleacherTypeUuid,
          eventTypeId,
          eventStart,
          eventEnd,
          currency,
        );
        if (priceCents !== null) {
          const updated = {
            ...item,
            overridePrice: false,
            unitPriceCents: priceCents,
            lineTotalCents: priceCents * item.qty,
          };
          updateLineItem(item.id, updated);
          return;
        }
      }
      handleUpdate(item.id, { overridePrice: false });
    } else {
      handleUpdate(item.id, { overridePrice: true });
    }
  };

  const grouped = lineItems.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, LineItem[]>,
  );

  const categoryOrder = ["bleachers", "logistics", "custom_service", "discounts"];

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Line Items</h2>

      {lineItems.length === 0 ? (
        <p className="py-4 text-center text-gray-400 text-sm border-t border-b">
          No line items added yet
        </p>
      ) : (
        <div className="space-y-6">
          {categoryOrder.map((cat) => {
            const items = grouped[cat];
            if (!items || items.length === 0) return null;

            return (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Item</th>
                      {cat === "bleachers" && (
                        <>
                          <th className="pb-2 font-medium w-16 text-center">Qty</th>
                          {editingEventId && (
                            <th className="pb-2 font-medium w-20 text-center">Assigned</th>
                          )}
                          <th className="pb-2 font-medium w-28 text-right">Unit Price</th>
                          <th className="pb-2 w-8"></th>
                        </>
                      )}
                      {(cat === "logistics" || cat === "custom_service") && (
                        <>
                          <th className="pb-2 font-medium w-16 text-center">Qty</th>
                          <th className="pb-2 font-medium w-28 text-right">Unit Price</th>
                        </>
                      )}
                      {cat === "discounts" && (
                        <>
                          <th className="pb-2 font-medium w-20">Type</th>
                          <th className="pb-2 font-medium w-24 text-right">Value</th>
                        </>
                      )}
                      <th className="pb-2 font-medium w-28 text-right">Total</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => handleUpdate(item.id, { label: e.target.value })}
                            className="w-full h-8 px-2 border rounded text-sm"
                          />
                          {cat === "bleachers" && (
                            <LineItemDescription
                              description={item.description}
                              className="mt-1 px-2"
                            />
                          )}
                        </td>

                        {cat === "bleachers" && (
                          <>
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(e) =>
                                  handleUpdate(item.id, {
                                    qty: Math.max(1, parseInt(e.target.value) || 1),
                                  })
                                }
                                className="w-full h-8 px-2 border rounded text-sm text-center"
                              />
                            </td>
                            {editingEventId &&
                              (() => {
                                const assigned = item.bleacherTypeUuid
                                  ? (assignedCountByType[item.bleacherTypeUuid] ?? 0)
                                  : 0;
                                const met = assigned === item.qty;
                                return (
                                  <td className="py-2 px-1 text-center">
                                    <AppTooltip
                                      content={
                                        met
                                          ? `${assigned} of ${item.qty} bleachers assigned — requirement met.`
                                          : `${assigned} of ${item.qty} bleachers assigned — go to the dashboard to assign the rest.`
                                      }
                                    >
                                      <span className="inline-flex items-center gap-1 tabular-nums text-sm font-medium cursor-default">
                                        <span className={met ? "text-green-700" : "text-red-600"}>
                                          {assigned}/{item.qty}
                                        </span>
                                        {met ? (
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <TriangleAlert className="w-4 h-4 text-red-500" />
                                        )}
                                      </span>
                                    </AppTooltip>
                                  </td>
                                );
                              })()}
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.unitPriceCents / 100}
                                disabled={!item.overridePrice}
                                onChange={(e) =>
                                  handleUpdate(item.id, {
                                    unitPriceCents: Math.round(
                                      (parseFloat(e.target.value) || 0) * 100,
                                    ),
                                  })
                                }
                                className={`w-full h-8 px-2 border rounded text-sm text-right ${
                                  !item.overridePrice ? "bg-gray-50 text-gray-500" : ""
                                }`}
                              />
                            </td>
                            <td className="py-2 px-1">
                              <button
                                onClick={() => togglePriceOverride(item)}
                                className="text-gray-400 hover:text-gray-600 transition cursor-pointer"
                                title={
                                  item.overridePrice
                                    ? "Unlock: restore price from matrix"
                                    : "Lock: manually override price"
                                }
                              >
                                {item.overridePrice ? (
                                  <Lock className="w-4 h-4 text-amber-500" />
                                ) : (
                                  <Unlock className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          </>
                        )}

                        {(cat === "logistics" || cat === "custom_service") && (
                          <>
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(e) =>
                                  handleUpdate(item.id, {
                                    qty: Math.max(1, parseInt(e.target.value) || 1),
                                  })
                                }
                                className="w-full h-8 px-2 border rounded text-sm text-center"
                              />
                            </td>
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.unitPriceCents / 100}
                                onChange={(e) =>
                                  handleUpdate(item.id, {
                                    unitPriceCents: Math.round(
                                      (parseFloat(e.target.value) || 0) * 100,
                                    ),
                                  })
                                }
                                className="w-full h-8 px-2 border rounded text-sm text-right"
                              />
                            </td>
                          </>
                        )}

                        {cat === "discounts" && (
                          <>
                            <td className="py-2 px-1">
                              <Dropdown
                                options={discountTypeOptions}
                                selected={item.discountType}
                                onSelect={(val) => handleUpdate(item.id, { discountType: val })}
                              />
                            </td>
                            <td className="py-2 px-1">
                              <input
                                type="number"
                                min={0}
                                step={item.discountType === "percentage" ? 1 : 100}
                                value={
                                  item.discountType === "percentage"
                                    ? item.discountValue
                                    : item.discountValue / 100
                                }
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value) || 0;
                                  const value =
                                    item.discountType === "percentage"
                                      ? raw
                                      : Math.round(raw * 100);
                                  handleUpdate(item.id, { discountValue: value });
                                }}
                                className="w-full h-8 px-2 border rounded text-sm text-right"
                              />
                            </td>
                          </>
                        )}

                        <td className="py-2 pl-2 text-right font-medium whitespace-nowrap">
                          {formatMoney(item.lineTotalCents, currency)}
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => removeLineItem(item.id)}
                            className="text-gray-400 hover:text-red-600 transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setField("isAddLineItemModalOpen", true)}
        className="mt-4 text-sm font-medium text-darkBlue border border-darkBlue rounded-sm px-3 py-1.5 hover:bg-blue-50 transition cursor-pointer"
      >
        + Add Line Item
      </button>
    </section>
  );
}
