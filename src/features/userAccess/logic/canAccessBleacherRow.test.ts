import { describe, expect, it } from "vitest";
import { canAccessBleacherRow } from "./canAccessBleacherRow";

// A Dashboard row is drawn grey when the person has no access to its bleacher. A maintainer has the
// whole fleet (they look after its condition, add repairs and write notes in any empty cell); they
// only cannot book it. docs/specs/repairs-11-dashboard.md §11, after the browser check of 2026-11-23.

const base = {
  isAdmin: false,
  isMaintainer: false,
  isAccountManager: false,
  accountManagerZoneIds: [] as string[],
  zoneUuid: "zone-a" as string | null,
};

describe("canAccessBleacherRow", () => {
  it("gives an administrator every bleacher, with or without a zone", () => {
    expect(canAccessBleacherRow({ ...base, isAdmin: true })).toBe(true);
    expect(canAccessBleacherRow({ ...base, isAdmin: true, zoneUuid: null })).toBe(true);
  });

  it("gives a maintainer every bleacher, in any zone and with none", () => {
    expect(canAccessBleacherRow({ ...base, isMaintainer: true })).toBe(true);
    expect(canAccessBleacherRow({ ...base, isMaintainer: true, zoneUuid: "zone-z" })).toBe(true);
    expect(canAccessBleacherRow({ ...base, isMaintainer: true, zoneUuid: null })).toBe(true);
  });

  it("gives an account manager only the bleachers of their own zones", () => {
    const am = { ...base, isAccountManager: true, accountManagerZoneIds: ["zone-a", "zone-b"] };
    expect(canAccessBleacherRow({ ...am, zoneUuid: "zone-a" })).toBe(true);
    expect(canAccessBleacherRow({ ...am, zoneUuid: "zone-c" })).toBe(false);
  });

  it("gives an account manager no bleacher that has no zone", () => {
    const am = { ...base, isAccountManager: true, accountManagerZoneIds: ["zone-a"] };
    expect(canAccessBleacherRow({ ...am, zoneUuid: null })).toBe(false);
  });

  it("gives a person with no role of these three nothing", () => {
    expect(canAccessBleacherRow(base)).toBe(false);
    expect(canAccessBleacherRow({ ...base, zoneUuid: null })).toBe(false);
  });

  it("gives the union to a person with two roles", () => {
    const both = {
      ...base,
      isMaintainer: true,
      isAccountManager: true,
      accountManagerZoneIds: ["zone-a"],
    };
    expect(canAccessBleacherRow({ ...both, zoneUuid: "zone-q" })).toBe(true);
  });
});
