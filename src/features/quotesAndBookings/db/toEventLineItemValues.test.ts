import { describe, it, expect } from "vitest";
import { toEventLineItemValues } from "./toEventLineItemValues";
import type { LineItem } from "../types/quoteTypes";

function lineItem(overrides: Partial<LineItem>): LineItem {
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
    ...overrides,
  };
}

describe("toEventLineItemValues", () => {
  it("saves a bleacher line item with its copied description", () => {
    expect(
      toEventLineItemValues(lineItem({ description: "Seats 300.\n- guard rails" }), "evt-1", "USD"),
    ).toEqual({
      event_uuid: "evt-1",
      header: "15 Row",
      description: "Seats 300.\n- guard rails",
      bleacher_type_uuid: "bt-15",
      value_cents: 50000,
      quantity: 2,
      currency: "USD",
    });
  });

  it("saves no description when the line item has none", () => {
    expect(toEventLineItemValues(lineItem({}), "evt-1", "USD").description).toBeNull();
  });

  it("saves no description for a draft persisted before descriptions existed", () => {
    const legacy = lineItem({});
    delete (legacy as Partial<LineItem>).description;
    expect(toEventLineItemValues(legacy, "evt-1", "USD").description).toBeNull();
  });

  it("saves a discount at its line total, with no bleacher type", () => {
    expect(
      toEventLineItemValues(
        lineItem({
          category: "discounts",
          label: "Loyalty",
          bleacherTypeUuid: null,
          qty: 1,
          unitPriceCents: 0,
          lineTotalCents: -2500,
        }),
        "evt-1",
        "CAD",
      ),
    ).toEqual({
      event_uuid: "evt-1",
      header: "Loyalty",
      description: null,
      bleacher_type_uuid: null,
      value_cents: -2500,
      quantity: 1,
      currency: "CAD",
    });
  });
});
