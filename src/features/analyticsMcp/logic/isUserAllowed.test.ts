import { describe, it, expect } from "vitest";
import { isUserAllowed } from "./isUserAllowed";
import { STATUSES } from "@/features/manageTeam/constants";

// docs/specs/analytics-mcp.md §1 D2: everyone with an account that is not deactivated.
describe("isUserAllowed", () => {
  it("refuses a Clerk user with no Users row", () => {
    expect(isUserAllowed(null)).toEqual({ allowed: false, reason: "no-account" });
  });

  it("refuses a deactivated account", () => {
    expect(isUserAllowed({ id: "u1", status_uuid: STATUSES.inactive })).toEqual({
      allowed: false,
      reason: "account-deactivated",
    });
  });

  it.each([
    ["active", STATUSES.active],
    ["invited", STATUSES.invited],
    ["no status at all", null],
  ])("allows an account that is %s", (_label, status) => {
    expect(isUserAllowed({ id: "u1", status_uuid: status })).toEqual({
      allowed: true,
      userId: "u1",
    });
  });
});
