import { describe, expect, it } from "vitest";
import { buildZoneByState, normalizeStateProvince, stateOfEvent, zoneOfEvent } from "./zoneOfEvent";

const zones = buildZoneByState([
  { state_province: "Texas", zone_uuid: "z-south" },
  { state_province: "Ontario", zone_uuid: "z-ontario" },
  { state_province: "Washington D.C.", zone_uuid: "z-east" },
  { state_province: null, zone_uuid: "z-bad" },
  { state_province: "Nowhere", zone_uuid: null },
]);

const form = (state_prov: unknown) => JSON.stringify({ state_prov });

describe("normalizeStateProvince", () => {
  it("ignores case and spacing, and writes D.C. one way", () => {
    expect(normalizeStateProvince("  TEXAS ")).toBe("texas");
    expect(normalizeStateProvince("New   York")).toBe("new york");
    expect(normalizeStateProvince("Washington DC")).toBe("district of columbia");
    expect(normalizeStateProvince("Washington D.C.")).toBe("district of columbia");
    expect(normalizeStateProvince(null)).toBe("");
  });
});

describe("buildZoneByState", () => {
  it("skips rows without a state or a zone", () => {
    expect([...zones.keys()].sort()).toEqual(["district of columbia", "ontario", "texas"]);
  });
});

describe("stateOfEvent", () => {
  it("takes the address first, even when the form said something else", () => {
    expect(stateOfEvent({ address_state: "Ontario", lead_submission: form("Texas") })).toBe(
      "Ontario",
    );
  });

  it("falls back to the website form when the address has no state", () => {
    expect(stateOfEvent({ address_state: "", lead_submission: form("Texas") })).toBe("Texas");
    expect(stateOfEvent({ address_state: null, lead_submission: form(" Texas ") })).toBe("Texas");
  });

  it("is null with neither, and for a form without a usable state", () => {
    expect(stateOfEvent({ address_state: null, lead_submission: null })).toBeNull();
    expect(stateOfEvent({ address_state: "  ", lead_submission: form("") })).toBeNull();
    expect(stateOfEvent({ address_state: null, lead_submission: form(5) })).toBeNull();
    expect(stateOfEvent({ address_state: null, lead_submission: "not json" })).toBeNull();
  });
});

describe("zoneOfEvent", () => {
  it("finds the zone of the address state, ignoring case", () => {
    expect(zoneOfEvent({ address_state: "TEXAS", lead_submission: null }, zones)).toBe("z-south");
  });

  it("uses the form's state when the address has none", () => {
    expect(zoneOfEvent({ address_state: null, lead_submission: form("Ontario") }, zones)).toBe(
      "z-ontario",
    );
  });

  it("finds Washington D.C. however it is written", () => {
    expect(zoneOfEvent({ address_state: "Washington DC", lead_submission: null }, zones)).toBe(
      "z-east",
    );
  });

  it("is null when the state is in no zone or there is no state", () => {
    expect(zoneOfEvent({ address_state: "Narnia", lead_submission: null }, zones)).toBeNull();
    expect(zoneOfEvent({ address_state: null, lead_submission: null }, zones)).toBeNull();
  });
});
