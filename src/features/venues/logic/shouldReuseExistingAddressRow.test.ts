import { describe, it, expect } from "vitest";
import { shouldReuseExistingAddressRow } from "./shouldReuseExistingAddressRow";

describe("shouldReuseExistingAddressRow", () => {
  it("reuses (mutates in place) when the event privately owns an existing address and was never linked to a venue", () => {
    expect(shouldReuseExistingAddressRow("addr-1", false)).toBe(true);
  });

  it("never reuses when the event was linked to a venue, even if address_uuid is present", () => {
    // address_uuid here IS the venue's own private row — mutating it would
    // corrupt every other event still linked to that venue.
    expect(shouldReuseExistingAddressRow("addr-1", true)).toBe(false);
  });

  it("never reuses when there is no existing address at all", () => {
    expect(shouldReuseExistingAddressRow(null, false)).toBe(false);
    expect(shouldReuseExistingAddressRow(null, true)).toBe(false);
  });
});
