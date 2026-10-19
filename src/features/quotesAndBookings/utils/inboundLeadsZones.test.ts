import { describe, expect, it } from "vitest";
import { inboundLeadsZones, sameZones } from "./inboundLeadsZones";

describe("inboundLeadsZones", () => {
  it("gives an account manager their zones and Zone Unknown", () => {
    expect(
      inboundLeadsZones({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: ["zone-1", "zone-3"],
      }),
    ).toEqual(["zone-1", "zone-3", "unknown"]);
  });

  it("lists a zone once, however many times the manager holds it", () => {
    expect(
      inboundLeadsZones({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: ["zone-1", "zone-1"],
      }),
    ).toEqual(["zone-1", "unknown"]);
  });

  it("gives a manager with no zones only Zone Unknown", () => {
    expect(
      inboundLeadsZones({ isAdmin: false, isAccountManager: true, accountManagerZoneIds: [] }),
    ).toEqual(["unknown"]);
  });

  it("filters no zone for an admin, even one who is also an account manager", () => {
    expect(
      inboundLeadsZones({ isAdmin: true, isAccountManager: true, accountManagerZoneIds: ["z"] }),
    ).toEqual([]);
  });

  it("filters no zone for someone who is not an account manager", () => {
    expect(
      inboundLeadsZones({ isAdmin: false, isAccountManager: false, accountManagerZoneIds: [] }),
    ).toEqual([]);
  });
});

describe("sameZones", () => {
  it("compares as sets, ignoring order", () => {
    expect(sameZones(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameZones([], [])).toBe(true);
    expect(sameZones(["a"], ["a", "b"])).toBe(false);
    expect(sameZones(["a", "c"], ["a", "b"])).toBe(false);
  });
});
