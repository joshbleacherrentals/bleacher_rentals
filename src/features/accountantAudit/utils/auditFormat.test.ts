import { describe, expect, it } from "vitest";
import { auditStatusLabel, formatAddressLines } from "./auditFormat";

// docs/specs/accountant-audit-04-table.md §3 and §5 (R3, R5, R11).

const addr = (over: Partial<Record<string, string | null>> = {}) => ({
  street: "195226 Allen Street",
  city: "Springfield",
  stateProvince: "IL",
  zipPostal: "62701",
  ...over,
});

describe("formatAddressLines", () => {
  it("returns the street and `city, state zip` for a full address", () => {
    expect(formatAddressLines(addr())).toEqual({
      street: "195226 Allen Street",
      place: "Springfield, IL 62701",
    });
  });

  it("leaves the street empty when there is none", () => {
    expect(formatAddressLines(addr({ street: null }))).toEqual({
      street: "",
      place: "Springfield, IL 62701",
    });
  });

  it("drops a missing city without a stray comma", () => {
    expect(formatAddressLines(addr({ city: null }))).toEqual({
      street: "195226 Allen Street",
      place: "IL 62701",
    });
  });

  it("keeps a zip that has no state", () => {
    expect(formatAddressLines(addr({ stateProvince: null }))).toEqual({
      street: "195226 Allen Street",
      place: "Springfield, 62701",
    });
  });

  it("handles an address that is only a zip", () => {
    expect(
      formatAddressLines({ street: null, city: null, stateProvince: null, zipPostal: "62701" }),
    ).toEqual({ street: "", place: "62701" });
  });

  it("has an empty place when only the street is known", () => {
    expect(
      formatAddressLines({ street: "1 Main St", city: null, stateProvince: null, zipPostal: null }),
    ).toEqual({ street: "1 Main St", place: "" });
  });

  it("is null for a null address", () => {
    expect(formatAddressLines(null)).toBeNull();
  });

  it("is null when every part is null, empty or only spaces", () => {
    expect(
      formatAddressLines({ street: null, city: null, stateProvince: null, zipPostal: null }),
    ).toBeNull();
    expect(
      formatAddressLines({ street: "", city: "", stateProvince: "", zipPostal: "" }),
    ).toBeNull();
    expect(
      formatAddressLines({ street: "  ", city: " ", stateProvince: "  ", zipPostal: " " }),
    ).toBeNull();
  });

  it("trims the parts", () => {
    expect(
      formatAddressLines({
        street: " 1 Main St ",
        city: " Toronto ",
        stateProvince: " ON ",
        zipPostal: " M5V 2T6 ",
      }),
    ).toEqual({ street: "1 Main St", place: "Toronto, ON M5V 2T6" });
  });
});

describe("auditStatusLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["released", "Released"],
    ["accepted", "Accepted"],
    ["dest_pickup", "In Progress"],
    ["pickup_inspection", "In Progress"],
    ["dest_dropoff", "In Progress"],
    ["dropoff_inspection", "In Progress"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["declined", "Declined"],
    ["abandoned", "Abandoned"],
  ])("%s is %s", (status, label) => {
    expect(auditStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for a status it does not know (R11)", () => {
    expect(auditStatusLabel("on_hold")).toBe("on_hold");
  });
});
