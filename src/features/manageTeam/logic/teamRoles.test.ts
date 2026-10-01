import { describe, expect, it } from "vitest";
import { ALL_ROLES, getAvailableRoles, hasNoRoles } from "./teamRoles";

const admin = { canAssignAdmin: true, canAssignAccountant: true };
const accountManager = { canAssignAdmin: false, canAssignAccountant: false };

describe("getAvailableRoles", () => {
  it("offers every role to an admin", () => {
    expect(getAvailableRoles([], admin)).toEqual(ALL_ROLES);
  });

  it("includes the accountant role in the list of roles that exist", () => {
    expect(ALL_ROLES).toContain("accountant");
  });

  it("hides Administrator and Accountant from an account manager — only an admin grants them", () => {
    const offered = getAvailableRoles([], accountManager);
    expect(offered).not.toContain("administrator");
    expect(offered).not.toContain("accountant");
  });

  it("leaves every other role available to an account manager, exactly as before", () => {
    expect(getAvailableRoles([], accountManager)).toEqual([
      "account-manager",
      "driver",
      "developer",
      "viewer",
      "maintainer",
    ]);
  });

  it("does not offer a role the user already holds", () => {
    expect(getAvailableRoles(["accountant", "viewer"], admin)).not.toContain("accountant");
    expect(getAvailableRoles(["accountant", "viewer"], admin)).not.toContain("viewer");
  });
});

describe("hasNoRoles", () => {
  const none = {
    isAdmin: false,
    isViewer: false,
    isDriver: false,
    isAccountManager: false,
    isDeveloper: false,
    isAccountant: false,
  };

  it("is true for a user with nothing assigned", () => {
    expect(hasNoRoles(none)).toBe(true);
  });

  it("is false for an accountant — otherwise an account manager could claim them as unassigned", () => {
    expect(hasNoRoles({ ...none, isAccountant: true })).toBe(false);
  });

  it.each(["isAdmin", "isViewer", "isDriver", "isAccountManager", "isDeveloper"] as const)(
    "is false when %s is set",
    (flag) => {
      expect(hasNoRoles({ ...none, [flag]: true })).toBe(false);
    },
  );
});
