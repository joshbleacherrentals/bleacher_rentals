import { describe, it, expect } from "vitest";
import { NO_DRIVER_MATCH } from "./driverZoneScope";
import { resolveWithdrawnScope, withdrawnTrackersQuery } from "./withdrawnTrackerScope";

describe("resolveWithdrawnScope", () => {
  it("scopes an active account manager to the drivers in their own zones", () => {
    expect(resolveWithdrawnScope({ isAdmin: false, accountManagerUuid: "am-1" })).toEqual({
      kind: "zones",
      accountManagerUuid: "am-1",
    });
  });

  it("counts nothing for an admin who is not also an account manager", () => {
    // Unlike the driver dropdown, the withdrawal counts are a nag aimed at
    // whoever has to re-cover the work. An admin with no zones has no work to
    // re-cover, so a company-wide number would be noise they cannot act on.
    expect(resolveWithdrawnScope({ isAdmin: true, accountManagerUuid: null })).toEqual({
      kind: "none",
    });
  });

  it("keeps an admin who is also an account manager inside their own zones", () => {
    expect(resolveWithdrawnScope({ isAdmin: true, accountManagerUuid: "am-1" })).toEqual({
      kind: "zones",
      accountManagerUuid: "am-1",
    });
  });

  it("counts nothing for a viewer", () => {
    expect(resolveWithdrawnScope({ isAdmin: false, accountManagerUuid: null })).toEqual({
      kind: "none",
    });
  });
});

describe("withdrawnTrackersQuery", () => {
  it("asks only for the two withdrawal statuses, inside the manager's zones", () => {
    const compiled = withdrawnTrackersQuery({ kind: "zones", accountManagerUuid: "am-1" });

    expect(compiled.sql).toContain('from "WorkTrackers"');
    expect(compiled.sql).toContain('"status" in');
    // The zone filter is a sub-select on purpose: a driver sitting in two of my
    // zones must not have their withdrawals counted twice.
    expect(compiled.sql).toContain('"driver_uuid" in (select');
    expect(compiled.sql).toContain('"DriverZones"');
    expect(compiled.sql).toContain('"AccountManagerZones"');
    expect(compiled.parameters).toEqual(["declined", "abandoned", "am-1"]);
  });

  it("returns no rows at all for a user with no zones", () => {
    const compiled = withdrawnTrackersQuery({ kind: "none" });

    expect(compiled.sql).toContain('"driver_uuid" = ?');
    expect(compiled.sql).not.toContain('"DriverZones"');
    expect(compiled.parameters).toEqual(["declined", "abandoned", NO_DRIVER_MATCH]);
  });
});
