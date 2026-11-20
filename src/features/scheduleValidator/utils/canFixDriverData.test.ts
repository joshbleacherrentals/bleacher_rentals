import { describe, it, expect } from "vitest";
import { canFixDriverData } from "./canFixDriverData";

describe("canFixDriverData", () => {
  it.each([
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])("admin %s, manages the zone %s → %s", (isAdmin, managesZone, expected) => {
    expect(canFixDriverData({ isAdmin, managesZone })).toBe(expected);
  });
});
