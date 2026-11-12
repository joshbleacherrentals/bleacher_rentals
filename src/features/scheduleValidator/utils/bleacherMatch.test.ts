import { describe, it, expect } from "vitest";
import { bleachersMatch, requiredBleachersByType } from "./bleacherMatch";

const item = (typeId: string | null, name: string | null, quantity: number | null) => ({
  bleacherTypeId: typeId,
  bleacherTypeName: name,
  quantity,
});
const req = (typeId: string, quantity: number) => ({ typeId, typeName: typeId, quantity });
const picks = (...typeIds: (string | null)[]) => typeIds.map((typeId) => ({ typeId }));

describe("requiredBleachersByType", () => {
  it("adds up the quantity of each bleacher type across line items", () => {
    const rows = [item("t7", "7 Row", 2), item("t10", "10 Row", 1), item("t7", "7 Row", 3)];
    expect(requiredBleachersByType(rows)).toEqual([
      { typeId: "t7", typeName: "7 Row", quantity: 5 },
      { typeId: "t10", typeName: "10 Row", quantity: 1 },
    ]);
  });

  it("counts a line item with no quantity as one", () => {
    expect(requiredBleachersByType([item("t7", "7 Row", null)])[0].quantity).toBe(1);
  });

  it("leaves out line items that are not a bleacher type", () => {
    expect(requiredBleachersByType([item(null, null, 4)])).toEqual([]);
  });
});

describe("bleachersMatch", () => {
  it("matches when each type has exactly the required number picked", () => {
    expect(bleachersMatch([req("a", 2), req("b", 1)], picks("a", "b", "a"))).toBe(true);
  });

  it("does not match when too few or too many are picked of a type", () => {
    expect(bleachersMatch([req("a", 2)], picks("a"))).toBe(false);
    expect(bleachersMatch([req("a", 2)], picks("a", "a", "a"))).toBe(false);
  });

  it("does not match when a required type has none picked or an unrequired type is picked", () => {
    expect(bleachersMatch([req("a", 1), req("b", 1)], picks("a"))).toBe(false);
    expect(bleachersMatch([req("a", 1)], picks("a", "c"))).toBe(false);
  });

  it("does not match when a picked bleacher has no type", () => {
    expect(bleachersMatch([req("a", 1)], picks("a", null))).toBe(false);
  });

  it("matches an event that requires nothing and has nothing picked", () => {
    expect(bleachersMatch([], [])).toBe(true);
  });
});
