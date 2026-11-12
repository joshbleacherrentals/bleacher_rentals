import { describe, it, expect } from "vitest";
import { bleacherNumberColor, isBleacherAccessible } from "./bleacherLabelStyle";

describe("bleacherNumberColor (the dashboard's colours for a bleacher number)", () => {
  it("is green for 7 rows, red for 10 and yellow for 15", () => {
    expect(bleacherNumberColor(7, true)).toBe("#15803d");
    expect(bleacherNumberColor(10, true)).toBe("#b91c1c");
    expect(bleacherNumberColor(15, true)).toBe("#eab308");
  });

  it("is black for any other number of rows, or none", () => {
    expect(bleacherNumberColor(5, true)).toBe("#000000");
    expect(bleacherNumberColor(null, true)).toBe("#000000");
  });

  it("fades towards grey when the viewer cannot access the bleacher", () => {
    // 40% of the way to the colour's grey, the same blend the dashboard uses.
    expect(bleacherNumberColor(7, false)).toBe("#307048");
    expect(bleacherNumberColor(null, false)).toBe("#000000");
  });
});

describe("isBleacherAccessible (who the dashboard shows a bleacher normally to)", () => {
  const zones = ["zone-a", "zone-b"];

  it("is true for an admin, whatever the zone", () => {
    expect(
      isBleacherAccessible({
        isAdmin: true,
        isAccountManager: false,
        accountManagerZoneIds: [],
        bleacherZoneUuid: "zone-z",
      }),
    ).toBe(true);
  });

  it("is true for an account manager of the bleacher's zone", () => {
    expect(
      isBleacherAccessible({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: zones,
        bleacherZoneUuid: "zone-a",
      }),
    ).toBe(true);
  });

  it("is false for an account manager of other zones, or for a bleacher with no zone", () => {
    const base = { isAdmin: false, isAccountManager: true, accountManagerZoneIds: zones };
    expect(isBleacherAccessible({ ...base, bleacherZoneUuid: "zone-z" })).toBe(false);
    expect(isBleacherAccessible({ ...base, bleacherZoneUuid: null })).toBe(false);
  });

  it("is false for anyone who is neither", () => {
    expect(
      isBleacherAccessible({
        isAdmin: false,
        isAccountManager: false,
        accountManagerZoneIds: zones,
        bleacherZoneUuid: "zone-a",
      }),
    ).toBe(false);
  });
});
