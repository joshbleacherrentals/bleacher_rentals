import { describe, it, expect } from "vitest";
import { newBleacherLineItem } from "./newBleacherLineItem";

const fifteenRow = {
  id: "bt-15",
  name: "15 Row",
  rowCount: 15,
  description: "Seats 300.\n\nIncludes:\n- guard rails",
};

describe("newBleacherLineItem", () => {
  it("copies the bleacher type's description onto the line item", () => {
    const item = newBleacherLineItem(fifteenRow, 50000);
    expect(item).toMatchObject({
      category: "bleachers",
      label: "15 Row",
      bleacherTypeUuid: "bt-15",
      qty: 1,
      unitPriceCents: 50000,
      lineTotalCents: 50000,
      overridePrice: false,
      description: "Seats 300.\n\nIncludes:\n- guard rails",
    });
    expect(item.id).toEqual(expect.any(String));
  });

  it("adds no description when the type has none", () => {
    expect(newBleacherLineItem({ ...fifteenRow, description: null }, 50000).description).toBeNull();
  });

  it("unlocks the price for manual entry when the matrix has no price", () => {
    expect(newBleacherLineItem(fifteenRow, null)).toMatchObject({
      unitPriceCents: 0,
      lineTotalCents: 0,
      overridePrice: true,
    });
  });

  it("gives every added line item its own id", () => {
    expect(newBleacherLineItem(fifteenRow, 1).id).not.toBe(newBleacherLineItem(fifteenRow, 1).id);
  });
});
