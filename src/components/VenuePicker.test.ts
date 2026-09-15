import { describe, it, expect } from "vitest";
import { venueAddressLine } from "./VenuePicker";

describe("venueAddressLine", () => {
  it("joins street, city, state, and zip with commas", () => {
    expect(
      venueAddressLine({
        street: "195226 Allen Street",
        city: "Springfield",
        stateProvince: "IL",
        zipPostal: "62701",
      }),
    ).toBe("195226 Allen Street, Springfield, IL, 62701");
  });

  it("skips blank fields rather than leaving stray commas", () => {
    expect(
      venueAddressLine({ street: "1 Main St", city: "", stateProvince: "ON", zipPostal: "" }),
    ).toBe("1 Main St, ON");
  });
});
