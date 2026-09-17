"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Dropdown } from "@/components/DropDown";
import CentsInput from "@/components/CentsInput";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import {
  WORK_TRACKER_LINE_ITEM_TYPES,
  WORK_TRACKER_LINE_ITEM_TYPE_LABELS,
  WorkTrackerLineItemType,
  DraftWorkTrackerLineItem,
} from "../db/workTrackerLineItems";
import { sanitizeQuantityInput } from "./quantityInput.logic";

const TYPE_OPTIONS = WORK_TRACKER_LINE_ITEM_TYPES.map((t) => ({
  label: WORK_TRACKER_LINE_ITEM_TYPE_LABELS[t],
  value: t,
}));

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * One line item row — edits a local draft in place via `onUpdate`. Nothing here
 * touches the database; the whole list is persisted together when the work
 * tracker is saved (see `syncWorkTrackerLineItems`).
 */
function LineItemRow({
  item,
  canEdit,
  onUpdate,
  onRemove,
}: {
  item: DraftWorkTrackerLineItem;
  canEdit: boolean;
  onUpdate: (patch: Partial<DraftWorkTrackerLineItem>) => void;
  onRemove: () => void;
}) {
  const [quantityInput, setQuantityInput] = useState(String(item.qtyDecimal));
  const [amountDisplay, setAmountDisplay] = useState(centsToDollars(item.unitAmtCents));

  const lineTotalCents = Math.round(item.qtyDecimal * item.unitAmtCents);

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-2">
        <Dropdown
          options={TYPE_OPTIONS}
          selected={item.type}
          onSelect={(value) => onUpdate({ type: value as WorkTrackerLineItemType })}
          disabled={!canEdit}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Quantity"
          className="w-24 p-1.5 border rounded bg-white text-sm"
          value={quantityInput}
          disabled={!canEdit}
          onChange={(e) => {
            const { display, value } = sanitizeQuantityInput(e.target.value);
            setQuantityInput(display);
            if (value !== item.qtyDecimal) onUpdate({ qtyDecimal: value });
          }}
          // A half-typed "2." or an emptied field is fine to hold while typing,
          // but on the way out it should read back as the number that was stored.
          onBlur={() => setQuantityInput(String(item.qtyDecimal))}
        />
      </td>
      <td className="py-2 pr-2">
        <CentsInput
          value={amountDisplay}
          className="w-28 p-1.5 border rounded bg-white text-sm"
          ariaLabel="Unit amount"
          disabled={!canEdit}
          onChange={(display, cents) => {
            setAmountDisplay(display);
            onUpdate({ unitAmtCents: cents ?? 0 });
          }}
        />
      </td>
      <td className="py-2 pr-2 text-right font-medium text-sm whitespace-nowrap">
        {formatMoney(lineTotalCents)}
      </td>
      <td className="py-2 pr-2">
        <input
          type="text"
          className="w-full p-1.5 border rounded bg-white text-sm"
          placeholder="Description"
          value={item.description ?? ""}
          disabled={!canEdit}
          onChange={(e) => onUpdate({ description: e.target.value === "" ? null : e.target.value })}
        />
      </td>
      <td className="py-2 pl-1 text-right">
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-600 transition-colors"
            aria-label="Remove line item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function AddLineItemRow({ onAdd }: { onAdd: (item: DraftWorkTrackerLineItem) => void }) {
  const [type, setType] = useState<WorkTrackerLineItemType>("hauling");
  const [quantityInput, setQuantityInput] = useState("1");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [description, setDescription] = useState("");

  const reset = () => {
    setType("hauling");
    setQuantityInput("1");
    setAmountDisplay("");
    setAmountCents(null);
    setDescription("");
  };

  const handleAdd = () => {
    const { display, value: qtyDecimal } = sanitizeQuantityInput(quantityInput);
    if (display === "") {
      createErrorToast(["Enter a valid quantity."]);
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      type,
      qtyDecimal,
      unitAmtCents: amountCents ?? 0,
      description: description.trim() === "" ? null : description.trim(),
      isAutomaticallyManaged: false,
    });
    reset();
  };

  return (
    <tr className="bg-gray-50">
      <td className="py-2 pr-2">
        <Dropdown
          options={TYPE_OPTIONS}
          selected={type}
          onSelect={(value) => setType(value as WorkTrackerLineItemType)}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label="New line item quantity"
          className="w-24 p-1.5 border rounded bg-white text-sm"
          value={quantityInput}
          onChange={(e) => setQuantityInput(sanitizeQuantityInput(e.target.value).display)}
        />
      </td>
      <td className="py-2 pr-2">
        <CentsInput
          value={amountDisplay}
          className="w-28 p-1.5 border rounded bg-white text-sm"
          placeholder="0.00"
          ariaLabel="Unit amount"
          onChange={(display, cents) => {
            setAmountDisplay(display);
            setAmountCents(cents);
          }}
        />
      </td>
      <td className="py-2 pr-2 text-right text-sm text-gray-400">—</td>
      <td className="py-2 pr-2">
        <input
          type="text"
          className="w-full p-1.5 border rounded bg-white text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </td>
      <td className="py-2 pl-1 text-right">
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-darkBlue text-white hover:bg-lightBlue transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </td>
    </tr>
  );
}

export default function WorkTrackerLineItemsTab({
  lineItems,
  onChange,
  canEdit,
  isLoading,
}: {
  lineItems: DraftWorkTrackerLineItem[];
  onChange: (next: DraftWorkTrackerLineItem[]) => void;
  canEdit: boolean;
  isLoading?: boolean;
}) {
  const updateItem = (id: string, patch: Partial<DraftWorkTrackerLineItem>) => {
    onChange(lineItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(lineItems.filter((item) => item.id !== id));
  };

  const addItem = (item: DraftWorkTrackerLineItem) => {
    onChange([...lineItems, item]);
  };

  return (
    <div>
      {isLoading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading line items...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="py-2 pr-2 font-medium">Type</th>
                <th className="py-2 pr-2 font-medium">Qty</th>
                <th className="py-2 pr-2 font-medium">Unit Amount</th>
                <th className="py-2 pr-2 font-medium text-right">Total</th>
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pl-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">
                    No line items yet.
                  </td>
                </tr>
              )}
              {lineItems.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
              {canEdit && <AddLineItemRow onAdd={addItem} />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
