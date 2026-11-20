import { describe, it, expect } from "vitest";
import {
  ADDRESS_REQUIREMENT,
  buildDriverData,
  type DriverAddress,
  type DriverDataInput,
  type DriverRequirement,
} from "./driverData";

const FULL_ADDRESS: DriverAddress = {
  street: "1663 Windham Rd 12",
  city: "Norfolk County",
  state_province: "ON",
  zip_postal: "N3Y 4K3",
  country: "Canada",
  latitude: 42.9,
  longitude: -80.3,
  place_id: "ChIJ123",
};

const driver = (over: Partial<DriverDataInput> = {}): DriverDataInput => ({
  driverUuid: "d1",
  driverName: "Justin Kowalsky",
  address: FULL_ADDRESS,
  ...over,
});

describe("ADDRESS_REQUIREMENT", () => {
  it("passes when every address column is filled", () => {
    expect(ADDRESS_REQUIREMENT.check(driver())).toEqual({ ok: true, problem: null });
  });

  it("fails when the driver has no address", () => {
    expect(ADDRESS_REQUIREMENT.check(driver({ address: null }))).toEqual({
      ok: false,
      problem: "No home address",
    });
  });

  it("names every missing column, treating blank text as missing", () => {
    const address = { ...FULL_ADDRESS, latitude: null, longitude: null, place_id: " " };
    expect(ADDRESS_REQUIREMENT.check(driver({ address }))).toEqual({
      ok: false,
      problem: "Missing latitude, longitude, Google place",
    });
  });

  it("accepts a coordinate of 0", () => {
    const address = { ...FULL_ADDRESS, longitude: 0 };
    expect(ADDRESS_REQUIREMENT.check(driver({ address })).ok).toBe(true);
  });
});

describe("buildDriverData", () => {
  it("passes a driver only when every requirement passes, and sorts by name", () => {
    const named: DriverRequirement = {
      key: "named",
      label: "Named",
      why: "",
      check: (d) => ({ ok: d.driverName !== "Zed", problem: null }),
    };
    const result = buildDriverData(
      [
        driver({ driverUuid: "d2", driverName: "Zed" }),
        driver({ driverUuid: "d1", driverName: "Amy", address: null }),
        driver({ driverUuid: "d3", driverName: "Bo" }),
      ],
      [ADDRESS_REQUIREMENT, named],
    );
    expect(result.map((d) => [d.driverName, d.ok])).toEqual([
      ["Amy", false],
      ["Bo", true],
      ["Zed", false],
    ]);
    expect(result[0].results.address.ok).toBe(false);
    expect(result[0].results.named.ok).toBe(true);
  });
});
