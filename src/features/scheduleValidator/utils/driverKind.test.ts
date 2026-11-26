import { describe, it, expect } from "vitest";
import { driverKindOf } from "./driverKind";

describe("driverKindOf", () => {
  it("is an employee with no vendor", () => {
    expect(driverKindOf({ vendor_uuid: null, vendor_name: null })).toEqual({ kind: "employee" });
  });

  it("is a contractor with a vendor, named when known", () => {
    expect(driverKindOf({ vendor_uuid: "v1", vendor_name: "StoneRidge" })).toEqual({
      kind: "contractor",
      vendorName: "StoneRidge",
    });
    expect(driverKindOf({ vendor_uuid: "v1", vendor_name: null })).toEqual({
      kind: "contractor",
      vendorName: null,
    });
  });
});
