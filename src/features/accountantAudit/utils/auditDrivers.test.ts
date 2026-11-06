import { describe, expect, it } from "vitest";
import { STATUSES } from "@/features/manageTeam/constants";
import type { DriverWithUser } from "@/features/workTrackers/hooks/useDrivers.db";
import { isDriverInactive, toAuditDriverOptions } from "./auditDrivers";

// docs/specs/accountant-audit-02-driver-select.md §3, §5 (R3, D13).

const driver = (id: string, first: string | null, last: string | null, over = {}) =>
  ({
    driver_uuid: id,
    user_id: `clerk-${id}`,
    first_name: first,
    last_name: last,
    email: `${id}@x.com`,
    is_active: 1,
    status_uuid: STATUSES.active,
    ...over,
  }) as unknown as DriverWithUser;

describe("isDriverInactive", () => {
  it("is false for is_active 1 and an active status", () => {
    expect(isDriverInactive({ is_active: 1, status_uuid: STATUSES.active })).toBe(false);
  });
  it("is true for is_active 0 and for null", () => {
    expect(isDriverInactive({ is_active: 0 })).toBe(true);
    expect(isDriverInactive({ is_active: null })).toBe(true);
  });
  it("is true for the inactive user status", () => {
    expect(isDriverInactive({ is_active: 1, status_uuid: STATUSES.inactive })).toBe(true);
  });
});

describe("toAuditDriverOptions", () => {
  it("maps ids and flags", () => {
    const [o] = toAuditDriverOptions([driver("d1", "Ann", "Lee", { is_active: 0 })]);
    expect(o).toEqual({
      id: "d1",
      driverUuid: "d1",
      clerkUserId: "clerk-d1",
      firstName: "Ann",
      lastName: "Lee",
      email: "d1@x.com",
      isInactive: true,
    });
  });
  it("sorts by first then last name, ignoring case", () => {
    const out = toAuditDriverOptions([
      driver("1", "bob", "Zed"),
      driver("2", "Anna", "Young"),
      driver("3", "Bob", "Adams"),
      driver("4", "anna", "Brown"),
    ]);
    expect(out.map((o) => o.id)).toEqual(["4", "2", "3", "1"]);
  });
  it("is stable for equal names (by id)", () => {
    const a = toAuditDriverOptions([driver("b", "Sam", "Roe"), driver("a", "Sam", "Roe")]);
    const b = toAuditDriverOptions([driver("a", "Sam", "Roe"), driver("b", "Sam", "Roe")]);
    expect(a.map((o) => o.id)).toEqual(["a", "b"]);
    expect(b.map((o) => o.id)).toEqual(["a", "b"]);
  });
  it("treats null names as empty", () => {
    expect(toAuditDriverOptions([driver("1", null, null)])[0].firstName).toBe("");
  });
});
