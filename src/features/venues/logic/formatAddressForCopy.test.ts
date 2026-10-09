import { describe, it, expect } from "vitest";
import { formatAddressForCopy } from "./formatAddressForCopy";

describe("formatAddressForCopy", () => {
  it("writes a full address on one line, ready to paste into a map search", () => {
    expect(
      formatAddressForCopy({
        street: "195226 Allen Street",
        city: "Springfield",
        stateProvince: "IL",
        zipPostal: "62701",
      }),
    ).toBe("195226 Allen Street, Springfield, IL 62701");
  });

  it("leaves out a missing zip without a stray comma or space", () => {
    expect(
      formatAddressForCopy({
        street: "1 Main St",
        city: "Toronto",
        stateProvince: "ON",
        zipPostal: "",
      }),
    ).toBe("1 Main St, Toronto, ON");
  });

  it("keeps the zip when there is no state", () => {
    expect(
      formatAddressForCopy({
        street: "1 Main St",
        city: "Paris",
        stateProvince: "",
        zipPostal: "75001",
      }),
    ).toBe("1 Main St, Paris, 75001");
  });

  it("copes with a street-only address", () => {
    expect(
      formatAddressForCopy({ street: "1 Main St", city: "", stateProvince: "", zipPostal: "" }),
    ).toBe("1 Main St");
  });

  it("trims stray whitespace from every part", () => {
    expect(
      formatAddressForCopy({
        street: "  1 Main St ",
        city: " Springfield",
        stateProvince: "IL ",
        zipPostal: " 62701 ",
      }),
    ).toBe("1 Main St, Springfield, IL 62701");
  });
});
