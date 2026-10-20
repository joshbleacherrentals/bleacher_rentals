import { describe, expect, it } from "vitest";
import type { LineItem } from "../types/quoteTypes";
import { diffLineItems, type ExistingLineItem } from "./diffLineItems";

// Spec: docs/specs/quote-detail-04-line-items-local.md §3 and §7 (test 1).
//
// What a Save has to write to turn the rows of a quote into the form's items: the rows to delete,
// the rows whose values differ, and the items that have no row yet. Compared by id.

const EVENT = "ev-1";

function item(over: Partial<LineItem> = {}): LineItem {
  return {
    id: "li-1",
    category: "bleachers",
    label: "15 Row",
    bleacherTypeUuid: "bt-15",
    qty: 2,
    unitPriceCents: 50000,
    lineTotalCents: 100000,
    overridePrice: false,
    discountType: "percentage",
    discountValue: 0,
    description: null,
    ...over,
  };
}

/** The row a saved copy of `item()` leaves in the database. */
function row(over: Partial<ExistingLineItem> = {}): ExistingLineItem {
  return {
    id: "li-1",
    header: "15 Row",
    description: null,
    bleacher_type_uuid: "bt-15",
    value_cents: 50000,
    quantity: 2,
    currency: "USD",
    is_price_overridden: 0,
    ...over,
  };
}

const diff = (existing: ExistingLineItem[], items: LineItem[], currency: "USD" | "CAD" = "USD") =>
  diffLineItems(existing, items, EVENT, currency);

describe("diffLineItems", () => {
  it("writes nothing when there are no rows and no items", () => {
    expect(diff([], [])).toEqual({ toDelete: [], toUpdate: [], toInsert: [] });
  });

  it("writes nothing when every item is exactly its row", () => {
    expect(diff([row()], [item()])).toEqual({ toDelete: [], toUpdate: [], toInsert: [] });
  });

  it("inserts an item that has no row, under the form's own id", () => {
    const result = diff([], [item({ id: "new-1", label: "Custom", bleacherTypeUuid: null })]);
    expect(result.toDelete).toEqual([]);
    expect(result.toUpdate).toEqual([]);
    expect(result.toInsert).toEqual([
      {
        id: "new-1",
        values: {
          event_uuid: EVENT,
          header: "Custom",
          description: null,
          bleacher_type_uuid: null,
          value_cents: 50000,
          quantity: 2,
          currency: "USD",
          is_price_overridden: false,
        },
      },
    ]);
  });

  it("deletes a row whose id is no longer in the form", () => {
    expect(diff([row({ id: "gone" }), row()], [item()])).toEqual({
      toDelete: ["gone"],
      toUpdate: [],
      toInsert: [],
    });
  });

  it("deletes every row when every item was removed", () => {
    expect(diff([row({ id: "a" }), row({ id: "b" })], [])).toEqual({
      toDelete: ["a", "b"],
      toUpdate: [],
      toInsert: [],
    });
  });

  describe("updates a row when exactly one written column differs", () => {
    const cases: Array<[string, Partial<LineItem>, Partial<ExistingLineItem>]> = [
      ["header", { label: "20 Row" }, { header: "15 Row" }],
      ["description", { description: "Seats 300." }, { description: null }],
      ["bleacher type", { bleacherTypeUuid: "bt-20" }, { bleacher_type_uuid: "bt-15" }],
      ["value", { unitPriceCents: 60000 }, { value_cents: 50000 }],
      ["quantity", { qty: 3 }, { quantity: 2 }],
      ["price override", { overridePrice: true }, { is_price_overridden: 0 }],
    ];

    for (const [column, change, existing] of cases) {
      it(column, () => {
        const result = diff([row(existing)], [item(change)]);
        expect(result.toDelete).toEqual([]);
        expect(result.toInsert).toEqual([]);
        expect(result.toUpdate.map((w) => w.id)).toEqual(["li-1"]);
      });
    }

    it("writes the item's values, with the id of the row", () => {
      const [write] = diff([row()], [item({ label: "20 Row", qty: 3 })]).toUpdate;
      expect(write).toEqual({
        id: "li-1",
        values: {
          event_uuid: EVENT,
          header: "20 Row",
          description: null,
          bleacher_type_uuid: "bt-15",
          value_cents: 50000,
          quantity: 3,
          currency: "USD",
          is_price_overridden: false,
        },
      });
    });
  });

  it("updates every row when the currency changed", () => {
    const result = diff(
      [row({ id: "a" }), row({ id: "b" })],
      [item({ id: "a" }), item({ id: "b" })],
      "CAD",
    );
    expect(result.toUpdate.map((w) => w.id)).toEqual(["a", "b"]);
    expect(result.toUpdate.every((w) => w.values.currency === "CAD")).toBe(true);
  });

  describe("discounts, which keep their total as the value", () => {
    const discount = (cents: number) =>
      item({
        id: "d-1",
        category: "discounts",
        bleacherTypeUuid: null,
        label: "Early bird",
        qty: 1,
        unitPriceCents: 0,
        lineTotalCents: cents,
      });
    const discountRow = (cents: number) =>
      row({
        id: "d-1",
        header: "Early bird",
        bleacher_type_uuid: null,
        value_cents: cents,
        quantity: 1,
      });

    it("writes nothing when the total is the row's value", () => {
      expect(diff([discountRow(-5000)], [discount(-5000)])).toEqual({
        toDelete: [],
        toUpdate: [],
        toInsert: [],
      });
    });

    it("updates the row when the total changed", () => {
      const result = diff([discountRow(-5000)], [discount(-7500)]);
      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].values.value_cents).toBe(-7500);
    });
  });

  describe("a row saved without the override flag", () => {
    it("reads a missing flag as overridden, as the editor does, so an overridden item is unchanged", () => {
      expect(diff([row({ is_price_overridden: null })], [item({ overridePrice: true })])).toEqual({
        toDelete: [],
        toUpdate: [],
        toInsert: [],
      });
    });

    it("updates it when the item follows the price matrix", () => {
      const result = diff([row({ is_price_overridden: null })], [item({ overridePrice: false })]);
      expect(result.toUpdate.map((w) => w.id)).toEqual(["li-1"]);
    });
  });

  it("does all three at once, each list in a stable order", () => {
    const result = diff(
      [row({ id: "keep" }), row({ id: "drop-1" }), row({ id: "edit" }), row({ id: "drop-2" })],
      [
        item({ id: "keep" }),
        item({ id: "edit", label: "Edited" }),
        item({ id: "add-1" }),
        item({ id: "add-2" }),
      ],
    );
    expect(result.toDelete).toEqual(["drop-1", "drop-2"]);
    expect(result.toUpdate.map((w) => w.id)).toEqual(["edit"]);
    expect(result.toInsert.map((w) => w.id)).toEqual(["add-1", "add-2"]);
  });
});
