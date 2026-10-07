import { describe, expect, it } from "vitest";
import {
  canMarkGroupPaid,
  canOpenWorkTrackerWeek,
  canReleaseAllDrafts,
  seesAllDriversAlways,
} from "./workTrackerPageAccess";

// docs/specs/accountant-work-trackers.md

describe("canOpenWorkTrackerWeek — who may open a week's driver list", () => {
  const cases: [string, boolean, boolean, boolean, boolean][] = [
    // name, isAdmin, isAccountManager, isAccountant, expected
    ["nobody", false, false, false, false],
    ["an account manager", false, true, false, true],
    ["an admin", true, false, false, true],
    ["an accountant", false, false, true, true],
    ["an admin who is also an account manager", true, true, false, true],
    ["an admin who is also an accountant", true, false, true, true],
    ["an account manager who is also an accountant", false, true, true, true],
    ["all three", true, true, true, true],
  ];

  it.each(cases)("%s", (_name, isAdmin, isAccountManager, isAccountant, expected) => {
    expect(canOpenWorkTrackerWeek({ isAdmin, isAccountManager, isAccountant })).toBe(expected);
  });
});

describe("seesAllDriversAlways — the 'See All Drivers' switch is permanently on", () => {
  it("is on for an accountant, who has no zones for 'my drivers' to mean anything", () => {
    expect(seesAllDriversAlways({ isAccountant: true })).toBe(true);
  });

  it("is not on for everyone else — an account manager still starts on their own zones", () => {
    expect(seesAllDriversAlways({ isAccountant: false })).toBe(false);
  });
});

describe("canReleaseAllDrafts — the Release All button", () => {
  it("is shown to an admin", () => {
    expect(canReleaseAllDrafts({ isAdmin: true, leadZoneIds: [] })).toBe(true);
  });

  it("is shown to an account manager who leads a zone", () => {
    expect(canReleaseAllDrafts({ isAdmin: false, leadZoneIds: ["zone-1"] })).toBe(true);
  });

  it("is hidden from an account manager who leads no zone", () => {
    expect(canReleaseAllDrafts({ isAdmin: false, leadZoneIds: [] })).toBe(false);
  });

  it("is hidden from an accountant-only user: not an admin, and no lead zones", () => {
    // The Accountant role cannot release work trackers (spec §0). It leads no zone and is not
    // an admin, so nothing in this function lets it through — and the function takes no
    // accountant input on purpose, so the role cannot be added as a way in.
    expect(canReleaseAllDrafts({ isAdmin: false, leadZoneIds: [] })).toBe(false);
    expect(canReleaseAllDrafts.length).toBe(1);
  });
});

describe("canMarkGroupPaid — the Mark Paid / Mark Unpaid button", () => {
  const cases: [string, boolean, boolean, boolean][] = [
    // name, isAdmin, isAccountant, expected
    ["nobody in particular (an account manager, a viewer, a maintainer…)", false, false, false],
    ["an admin", true, false, true],
    ["an accountant", false, true, true],
    ["an admin who is also an accountant", true, true, true],
  ];

  it.each(cases)("%s", (_name, isAdmin, isAccountant, expected) => {
    expect(canMarkGroupPaid({ isAdmin, isAccountant })).toBe(expected);
  });
});
