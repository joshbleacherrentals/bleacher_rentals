import { describe, expect, it } from "vitest";
import { STATUSES } from "@/features/manageTeam/constants";
import { isDriverInactive } from "./auditDrivers";

// docs/specs/accountant-audit-02-driver-select.md §3, §5 (R3); the select's helper code was
// deleted by accountant-audit-05-drivers-table.md (D11, R15).

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
