import { describe, it, expect } from "vitest";
import { canFixZoneData } from "./canFixZoneData";

describe("canFixZoneData", () => {
  it.each([
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])("admin %s, manages the zone %s → %s", (isAdmin, managesZone, expected) => {
    expect(canFixZoneData({ isAdmin, managesZone })).toBe(expected);
  });
});
