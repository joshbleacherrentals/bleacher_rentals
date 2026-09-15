import { describe, it, expect } from "vitest";
import { formatAddressLine } from "./AddressAutoComplete";

describe("formatAddressLine", () => {
  it("joins street, city, state, and postal code with commas", () => {
    expect(
      formatAddressLine({
        street: "195226 Allen Street",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
      }),
    ).toBe("195226 Allen Street, Springfield, IL, 62701");
  });

  it("skips blank fields rather than leaving stray commas", () => {
    expect(formatAddressLine({ street: "1 Main St", city: "", state: "ON", postalCode: "" })).toBe(
      "1 Main St, ON",
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(formatAddressLine({})).toBe("");
  });
});
