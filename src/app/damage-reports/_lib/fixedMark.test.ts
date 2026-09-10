import { describe, it, expect } from "vitest";

import {
  buildRemoveFixedMarkUpdate,
  buildResolveWithoutMaintenanceUpdate,
  canResolveWithoutMaintenance,
  describeFixedMark,
} from "./fixedMark";

/**
 * "Fixed by driver" — the manager's half.
 *
 * Spec: br_driver/docs/specs/driver-fixed-damage-reports.md
 *
 * A driver marking a report fixed is a claim, not a closure. What this module
 * decides is when that claim earns the one-click close — the shortcut that
 * skips creating a maintenance event, and the only thing that finally drops the
 * report off every driver's phone.
 */

describe("when the one-click resolve is offered", () => {
  it("is offered on an open report a driver says is fixed", () => {
    expect(canResolveWithoutMaintenance({ fixed_by_driver: true, resolved_at: null })).toBe(true);
  });

  it("is not offered on a report nobody has marked", () => {
    // The manager's normal path is Create Maintenance to Resolve: closing a
    // report with no repair behind it and no driver vouching for it would lose
    // the damage silently.
    expect(canResolveWithoutMaintenance({ fixed_by_driver: false, resolved_at: null })).toBe(false);
  });

  it("is not offered on an already-resolved report", () => {
    expect(
      canResolveWithoutMaintenance({
        fixed_by_driver: true,
        resolved_at: "2026-09-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("treats a missing flag as unmarked", () => {
    expect(canResolveWithoutMaintenance({ fixed_by_driver: null, resolved_at: null })).toBe(false);
  });
});

describe("the resolve itself", () => {
  it("sets resolved_at and nothing else", () => {
    const update = buildResolveWithoutMaintenanceUpdate("2026-09-09T10:00:00.000Z");

    // No maintenance_event_uuid: there was no repair event, and inventing one
    // would put a phantom job in the maintenance history.
    expect(update).toEqual({ resolved_at: "2026-09-09T10:00:00.000Z" });
  });
});

describe("removing the mark", () => {
  it("clears all three columns together", () => {
    // Postgres rejects any other combination (CHECK constraint), so a partial
    // clear here would surface as a failed save, not a wrong row.
    expect(buildRemoveFixedMarkUpdate()).toEqual({
      fixed_by_driver: false,
      fixed_at: null,
      fixed_by_user_uuid: null,
    });
  });
});

describe("what the panel says", () => {
  it("names the driver and the date", () => {
    expect(
      describeFixedMark({
        fixed_at: "2026-09-09T10:00:00.000Z",
        first_name: "Sam",
        last_name: "Rivera",
      }),
    ).toContain("Sam Rivera");
  });

  it("still reads as a sentence when the name is missing", () => {
    const text = describeFixedMark({
      fixed_at: "2026-09-09T10:00:00.000Z",
      first_name: null,
      last_name: null,
    });

    expect(text).toContain("Fixed by a driver");
    expect(text).not.toContain("null");
  });
});
