import { describe, it, expect } from "vitest";
import { venueAddressKey } from "./venueAddressKey";

describe("venueAddressKey", () => {
  it("is case- and whitespace-insensitive", () => {
    const a = venueAddressKey({
      street: "  195226 Allen Street ",
      city: "Springfield",
      stateProvince: "IL",
      zipPostal: "62701",
    });
    const b = venueAddressKey({
      street: "195226 allen street",
      city: "SPRINGFIELD",
      stateProvince: "il",
      zipPostal: "62701",
    });
    expect(a).toBe(b);
  });

  it("differs when any field differs", () => {
    const base = {
      street: "1 Main St",
      city: "Springfield",
      stateProvince: "IL",
      zipPostal: "62701",
    };
    expect(venueAddressKey(base)).not.toBe(venueAddressKey({ ...base, street: "2 Main St" }));
    expect(venueAddressKey(base)).not.toBe(venueAddressKey({ ...base, zipPostal: "62702" }));
  });

  it("handles missing optional-ish fields as empty strings, not crashing", () => {
    expect(() =>
      venueAddressKey({ street: "1 Main St", city: "", stateProvince: "", zipPostal: "" }),
    ).not.toThrow();
  });
});
