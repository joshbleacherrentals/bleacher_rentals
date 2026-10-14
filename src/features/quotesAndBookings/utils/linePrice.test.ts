import { describe, it, expect } from "vitest";
import {
  findPriceChanges,
  matrixPriceUpdates,
  priceControl,
  summarizePriceReview,
  withManualPrice,
  withMatrixPrice,
} from "./linePrice";
import type { LineItem } from "../types/quoteTypes";

function line(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: "li-1",
    category: "bleachers",
    label: "10 Row",
    bleacherTypeUuid: "bt-10",
    qty: 2,
    unitPriceCents: 540000,
    lineTotalCents: 1080000,
    overridePrice: true,
    discountType: "fixed",
    discountValue: 0,
    description: null,
    ...overrides,
  };
}

describe("priceControl", () => {
  it("a hand-set price is editable and its button resets it to the matrix price", () => {
    expect(priceControl(line({ overridePrice: true }), 180000)).toEqual({
      editable: true,
      action: "reset",
      canReset: true,
    });
  });

  it("a hand-set price cannot be reset when the matrix has no price for this event", () => {
    expect(priceControl(line({ overridePrice: true }), null)).toEqual({
      editable: true,
      action: "reset",
      canReset: false,
    });
  });

  it("a matrix-following price is locked and its button lets you type your own", () => {
    expect(priceControl(line({ overridePrice: false, unitPriceCents: 180000 }), 180000)).toEqual({
      editable: false,
      action: "edit",
      canReset: false,
    });
  });
});

describe("withMatrixPrice (the explicit reset)", () => {
  it("takes the matrix price, recomputes the total and stops being an override", () => {
    expect(withMatrixPrice(line(), 180000)).toMatchObject({
      overridePrice: false,
      unitPriceCents: 180000,
      lineTotalCents: 360000,
      qty: 2,
    });
  });

  it("changes nothing else about the line", () => {
    const before = line({ label: "Custom label", description: "Seats 300" });
    const after = withMatrixPrice(before, 180000);
    expect({
      ...after,
      overridePrice: before.overridePrice,
      unitPriceCents: before.unitPriceCents,
      lineTotalCents: before.lineTotalCents,
    }).toEqual(before);
  });
});

describe("withManualPrice (unlocking to type a price)", () => {
  it("keeps the current price and marks it as the person's own", () => {
    expect(withManualPrice(line({ overridePrice: false, unitPriceCents: 180000 }))).toMatchObject({
      overridePrice: true,
      unitPriceCents: 180000,
    });
  });
});

describe("matrixPriceUpdates (a matrix-following line always has the matrix price)", () => {
  const matrix = (cents: number | null) => () => cents;

  it("re-prices a matrix-following bleacher line and recomputes its total", () => {
    expect(
      matrixPriceUpdates([line({ overridePrice: false, unitPriceCents: 180000 })], matrix(340000)),
    ).toEqual([{ id: "li-1", unitPriceCents: 340000, lineTotalCents: 680000 }]);
  });

  it("never touches a hand-priced line, however far it is from the matrix", () => {
    expect(
      matrixPriceUpdates([line({ overridePrice: true, unitPriceCents: 540000 })], matrix(180000)),
    ).toEqual([]);
  });

  it("does nothing for a line that already has the matrix price", () => {
    expect(
      matrixPriceUpdates([line({ overridePrice: false, unitPriceCents: 180000 })], matrix(180000)),
    ).toEqual([]);
  });

  it("leaves a line alone when the matrix has no price for it", () => {
    expect(
      matrixPriceUpdates([line({ overridePrice: false, unitPriceCents: 180000 })], matrix(null)),
    ).toEqual([]);
  });

  it("only re-prices bleacher lines", () => {
    const service = line({
      id: "svc",
      category: "custom_service",
      bleacherTypeUuid: null,
      overridePrice: false,
      unitPriceCents: 5000,
    });
    const discount = line({
      id: "disc",
      category: "discounts",
      bleacherTypeUuid: null,
      overridePrice: false,
      unitPriceCents: 0,
      lineTotalCents: -2500,
    });
    expect(matrixPriceUpdates([service, discount], matrix(999))).toEqual([]);
  });

  it("looks each line up by itself and updates only the ones that differ", () => {
    const a = line({ id: "a", bleacherTypeUuid: "bt-10", overridePrice: false, unitPriceCents: 1 });
    const b = line({ id: "b", bleacherTypeUuid: "bt-15", overridePrice: false, unitPriceCents: 7 });
    const c = line({ id: "c", bleacherTypeUuid: "bt-4", overridePrice: true, unitPriceCents: 9 });
    const prices: Record<string, number> = { "bt-10": 100, "bt-15": 7, "bt-4": 400 };
    expect(matrixPriceUpdates([a, b, c], (i) => prices[i.bleacherTypeUuid!] ?? null)).toEqual([
      { id: "a", unitPriceCents: 100, lineTotalCents: 200 },
    ]);
  });
});

describe("findPriceChanges (what Save is about to change on a stored quote)", () => {
  it("finds nothing when no price changed", () => {
    expect(findPriceChanges([line()], [line()])).toEqual([]);
  });

  it("reports a changed unit price with its before and after", () => {
    expect(
      findPriceChanges(
        [line({ unitPriceCents: 180000 })],
        [line({ unitPriceCents: 340000, lineTotalCents: 680000 })],
      ),
    ).toEqual([
      {
        id: "li-1",
        label: "10 Row",
        qty: 2,
        beforeCents: 180000,
        afterCents: 340000,
        isDiscount: false,
      },
    ]);
  });

  it("does not report a quantity change, a new line or a removed line as a price change", () => {
    const stored = [line({ id: "a", qty: 2 }), line({ id: "gone", label: "Removed" })];
    const current = [
      line({ id: "a", qty: 5, lineTotalCents: 2700000 }),
      line({ id: "new", label: "Brand new", unitPriceCents: 1 }),
    ];
    expect(findPriceChanges(stored, current)).toEqual([]);
  });

  it("compares a discount by its amount", () => {
    const stored = line({
      id: "d",
      category: "discounts",
      label: "Loyalty",
      bleacherTypeUuid: null,
      unitPriceCents: 0,
      lineTotalCents: -2500,
    });
    const current = { ...stored, lineTotalCents: -5000 };
    expect(findPriceChanges([stored], [current])).toEqual([
      {
        id: "d",
        label: "Loyalty",
        qty: 2,
        beforeCents: -2500,
        afterCents: -5000,
        isDiscount: true,
      },
    ]);
  });

  it("matches by id even when two lines share a label", () => {
    const stored = [line({ id: "x", unitPriceCents: 100 }), line({ id: "y", unitPriceCents: 200 })];
    const current = [
      line({ id: "x", unitPriceCents: 100 }),
      line({ id: "y", unitPriceCents: 250, lineTotalCents: 500 }),
    ];
    expect(findPriceChanges(stored, current)).toEqual([
      { id: "y", label: "10 Row", qty: 2, beforeCents: 200, afterCents: 250, isDiscount: false },
    ]);
  });

  it("still compares after a save re-created the stored lines under new ids", () => {
    // Saving a quote re-inserts its lines with fresh ids; a form kept open after Preview or Send
    // still holds the old ones.
    const stored = [line({ id: "new-id-1", unitPriceCents: 180000 })];
    const current = [line({ id: "old-id-1", unitPriceCents: 340000, lineTotalCents: 680000 })];
    expect(findPriceChanges(stored, current)).toEqual([
      {
        id: "old-id-1",
        label: "10 Row",
        qty: 2,
        beforeCents: 180000,
        afterCents: 340000,
        isDiscount: false,
      },
    ]);
  });

  it("does not match a new line to a stored line that an id already claimed", () => {
    const stored = [line({ id: "a", unitPriceCents: 100 })];
    const current = [
      line({ id: "a", unitPriceCents: 100 }),
      line({ id: "b", unitPriceCents: 999, lineTotalCents: 1998 }),
    ];
    expect(findPriceChanges(stored, current)).toEqual([]);
  });
});

describe("summarizePriceReview", () => {
  it("has no changes and so nothing to confirm when prices are unchanged", () => {
    expect(summarizePriceReview([line()], [line()]).changes).toEqual([]);
  });

  it("totals the line items before and after, before tax", () => {
    const stored = [line({ unitPriceCents: 180000, lineTotalCents: 360000 })];
    const current = [line({ unitPriceCents: 340000, lineTotalCents: 680000 })];
    expect(summarizePriceReview(stored, current)).toMatchObject({
      totalBeforeCents: 360000,
      totalAfterCents: 680000,
    });
  });
});
