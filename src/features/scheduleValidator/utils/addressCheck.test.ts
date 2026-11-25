import { describe, it, expect } from "vitest";
import { checkAddress, type StoredAddress } from "./addressCheck";

const FULL: StoredAddress = {
  street: "1 Main St",
  city: "Simcoe",
  state_province: "ON",
  zip_postal: "N3Y 4K3",
  country: "CA",
  latitude: 42.9,
  longitude: -80.3,
  place_id: "ChIJ1",
};

describe("checkAddress", () => {
  it("passes a complete address", () => {
    expect(checkAddress(FULL, "none")).toEqual({ ok: true, problem: null });
  });

  it("uses the caller's words when there is no address", () => {
    expect(checkAddress(null, "No address")).toEqual({ ok: false, problem: "No address" });
  });

  it("names the missing columns", () => {
    expect(checkAddress({ ...FULL, latitude: null, city: " " }, "none").problem).toBe(
      "Missing city, latitude",
    );
  });
});
