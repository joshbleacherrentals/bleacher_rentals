import { describe, it, expect } from "vitest";
import { inferCategory, toLineItem } from "./fetchLineItems";

describe("inferCategory", () => {
  it('returns "bleachers" when bleacher_type_uuid is present', () => {
    expect(
      inferCategory({
        id: "1",
        header: "10-row",
        bleacher_type_uuid: "uuid-123",
        quantity: 2,
        value_cents: 5000,
      }),
    ).toBe("bleachers");
  });

  it('returns "discounts" when value_cents is negative', () => {
    expect(
      inferCategory({
        id: "2",
        header: "Discount",
        bleacher_type_uuid: null,
        quantity: 1,
        value_cents: -1000,
      }),
    ).toBe("discounts");
  });

  it('returns "custom_service" for positive value without bleacher uuid', () => {
    expect(
      inferCategory({
        id: "3",
        header: "Delivery",
        bleacher_type_uuid: null,
        quantity: 1,
        value_cents: 3000,
      }),
    ).toBe("custom_service");
  });

  it('returns "custom_service" when value_cents is zero', () => {
    expect(
      inferCategory({
        id: "4",
        header: "Free item",
        bleacher_type_uuid: null,
        quantity: 1,
        value_cents: 0,
      }),
    ).toBe("custom_service");
  });

  it('returns "custom_service" when value_cents is null', () => {
    expect(
      inferCategory({
        id: "5",
        header: "Item",
        bleacher_type_uuid: null,
        quantity: null,
        value_cents: null,
      }),
    ).toBe("custom_service");
  });

  it('prioritizes "bleachers" over negative value', () => {
    expect(
      inferCategory({
        id: "6",
        header: "Weird row",
        bleacher_type_uuid: "uuid-456",
        quantity: 1,
        value_cents: -500,
      }),
    ).toBe("bleachers");
  });
});

describe("toLineItem", () => {
  it("loads a bleacher line item with its saved description", () => {
    expect(
      toLineItem({
        id: "1",
        header: "15 Row",
        bleacher_type_uuid: "bt-15",
        quantity: 2,
        value_cents: 50000,
        description: "Seats 300.\n- guard rails",
        is_price_overridden: 0,
      }),
    ).toEqual({
      id: "1",
      category: "bleachers",
      label: "15 Row",
      bleacherTypeUuid: "bt-15",
      qty: 2,
      unitPriceCents: 50000,
      lineTotalCents: 100000,
      overridePrice: false,
      discountType: "fixed",
      discountValue: 0,
      description: "Seats 300.\n- guard rails",
    });
  });

  it("loads no description when none was saved", () => {
    expect(
      toLineItem({
        id: "2",
        header: "Delivery",
        bleacher_type_uuid: null,
        quantity: 1,
        value_cents: 3000,
        description: null,
        is_price_overridden: 1,
      }).description,
    ).toBeNull();
  });

  it("keeps a discount's saved description", () => {
    expect(
      toLineItem({
        id: "3",
        header: "Loyalty",
        bleacher_type_uuid: null,
        quantity: 1,
        value_cents: -2500,
        description: "Returning customer",
        is_price_overridden: 0,
      }).description,
    ).toBe("Returning customer");
  });

  describe("whether the price was typed by hand", () => {
    const row = {
      id: "p1",
      header: "10 Row",
      bleacher_type_uuid: "bt-10",
      quantity: 2,
      value_cents: 540000,
      description: null,
    };

    it("loads a hand-set price as overridden, so it stays editable and is never re-priced", () => {
      expect(toLineItem({ ...row, is_price_overridden: 1 })).toMatchObject({
        unitPriceCents: 540000,
        overridePrice: true,
      });
    });

    it("loads a matrix-following price as not overridden", () => {
      expect(toLineItem({ ...row, is_price_overridden: 0 }).overridePrice).toBe(false);
    });

    it("treats a row synced without the flag as overridden: keeping a price is the safe mistake", () => {
      expect(toLineItem({ ...row, is_price_overridden: null }).overridePrice).toBe(true);
    });

    it("never touches the saved price, whichever way the flag is set", () => {
      for (const flag of [0, 1, null]) {
        expect(toLineItem({ ...row, is_price_overridden: flag })).toMatchObject({
          unitPriceCents: 540000,
          lineTotalCents: 1080000,
        });
      }
    });
  });
});
