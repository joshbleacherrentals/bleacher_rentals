import { describe, expect, it } from "vitest";
import {
  inboundLeadsFilters,
  inboundLeadsZones,
  sameZones,
  unstaffedZoneIds,
} from "./inboundLeadsZones";

const user = (over: Partial<Parameters<typeof inboundLeadsZones>[0]>) => ({
  isAdmin: false,
  isAccountManager: false,
  accountManagerZoneIds: [],
  unstaffedZoneIds: [],
  ...over,
});

describe("inboundLeadsZones", () => {
  it("gives an account manager only the zones they are assigned to", () => {
    expect(
      inboundLeadsZones(
        user({
          isAccountManager: true,
          accountManagerZoneIds: ["zone-1", "zone-3"],
          unstaffedZoneIds: ["zone-6"],
        }),
      ),
    ).toEqual(["zone-1", "zone-3"]);
  });

  it("lists a zone once, however many times the manager holds it", () => {
    expect(
      inboundLeadsZones(user({ isAccountManager: true, accountManagerZoneIds: ["z", "z"] })),
    ).toEqual(["z"]);
  });

  it("gives an admin Zone Unknown and the unstaffed zones, and no staffed zone", () => {
    expect(inboundLeadsZones(user({ isAdmin: true, unstaffedZoneIds: ["zone-6"] }))).toEqual([
      "unknown",
      "zone-6",
    ]);
    expect(inboundLeadsZones(user({ isAdmin: true }))).toEqual(["unknown"]);
  });

  it("gives someone who is both admin and account manager both lists, once each", () => {
    expect(
      inboundLeadsZones(
        user({
          isAdmin: true,
          isAccountManager: true,
          accountManagerZoneIds: ["zone-1", "zone-6"],
          unstaffedZoneIds: ["zone-6"],
        }),
      ),
    ).toEqual(["zone-1", "zone-6", "unknown"]);
  });

  it("gives an account manager with no zones a filter that matches nothing, not every zone", () => {
    expect(inboundLeadsZones(user({ isAccountManager: true }))).toEqual(["no-zones"]);
  });

  it("gives someone who is neither no zone filter", () => {
    expect(inboundLeadsZones(user({}))).toEqual([]);
  });
});

describe("unstaffedZoneIds", () => {
  it("is every zone nobody works", () => {
    expect(unstaffedZoneIds(["z1", "z2", "z6"], ["z1", "z2", "z1"])).toEqual(["z6"]);
    expect(unstaffedZoneIds(["z1"], ["z1"])).toEqual([]);
    expect(unstaffedZoneIds(["z1", "z2"], [])).toEqual(["z1", "z2"]);
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

describe("inboundLeadsFilters", () => {
  it("is unsent website quotes in the given zones and nothing else", () => {
    const filters = inboundLeadsFilters(["zone-1", "unknown"]);
    expect(filters).toMatchObject({
      statuses: ["draft"],
      inbound: true,
      zoneUuids: ["zone-1", "unknown"],
      accountManagerUserUuid: null,
      salesOfficeUuid: null,
      createdFrom: null,
      eventFrom: null,
      bookedFrom: null,
      inGoodShuffle: null,
      inQuickBooks: null,
    });
  });
});
