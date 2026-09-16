import { describe, it, expect } from "vitest";
import { NO_DRIVER_MATCH } from "./driverZoneScope";
import { resolveAttentionScope, attentionTrackersQuery } from "./attentionTrackerScope";

describe("resolveAttentionScope", () => {
  it("scopes an active account manager to the drivers in their own zones", () => {
    expect(resolveAttentionScope({ isAdmin: false, accountManagerUuid: "am-1" })).toEqual({
      kind: "zones",
      accountManagerUuid: "am-1",
    });
  });

  it("counts nothing for an admin who is not also an account manager", () => {
    // Unlike the driver dropdown, the attention counts are a nag aimed at
    // whoever has to re-cover the work. An admin with no zones has no work to
    // re-cover, so a company-wide number would be noise they cannot act on.
    expect(resolveAttentionScope({ isAdmin: true, accountManagerUuid: null })).toEqual({
      kind: "none",
    });
  });

  it("keeps an admin who is also an account manager inside their own zones", () => {
    expect(resolveAttentionScope({ isAdmin: true, accountManagerUuid: "am-1" })).toEqual({
      kind: "zones",
      accountManagerUuid: "am-1",
    });
  });

  it("counts nothing for a viewer", () => {
    expect(resolveAttentionScope({ isAdmin: false, accountManagerUuid: null })).toEqual({
      kind: "none",
    });
  });
});

describe("attentionTrackersQuery", () => {
  it("asks for withdrawals and bleacher swaps, inside the manager's zones", () => {
    const compiled = attentionTrackersQuery({ kind: "zones", accountManagerUuid: "am-1" });

    expect(compiled.sql).toContain('from "WorkTrackers"');
    expect(compiled.sql).toContain('"status" in');
    // The zone filter is a sub-select on purpose: a driver sitting in two of my
    // zones must not have their trackers counted twice.
    expect(compiled.sql).toContain('"driver_uuid" in (select');
    expect(compiled.sql).toContain('"DriverZones"');
    expect(compiled.sql).toContain('"AccountManagerZones"');
    expect(compiled.parameters).toEqual(["declined", "abandoned", "cancelled", "am-1"]);
  });

  it("returns no rows at all for a user with no zones", () => {
    const compiled = attentionTrackersQuery({ kind: "none" });

    expect(compiled.sql).toContain('"driver_uuid" = ?');
    expect(compiled.sql).not.toContain('"DriverZones"');
    expect(compiled.parameters).toEqual(["declined", "abandoned", "cancelled", NO_DRIVER_MATCH]);
  });

  it("also asks for trackers run with a different bleacher than assigned", () => {
    const compiled = attentionTrackersQuery({ kind: "zones", accountManagerUuid: "am-1" });

    expect(compiled.sql).toContain('"wt"."id" as "id"');
    expect(compiled.sql).toContain('"bleacher_uuid" as "bleacher_uuid"');
    expect(compiled.sql).toContain('"actual_bleacher_uuid" as "actual_bleacher_uuid"');
    expect(compiled.sql).toContain('"actual_bleacher_uuid" is not null');
    // `is not`, not `!=`: a swap onto a tracker with no assigned bleacher is still a swap,
    // and `!=` against NULL would quietly drop it.
    expect(compiled.sql).toContain('"actual_bleacher_uuid" is not "wt"."bleacher_uuid"');
    expect(compiled.sql).toContain('"status" != ?');
    expect(compiled.parameters).toEqual(["declined", "abandoned", "cancelled", "am-1"]);
  });
});
