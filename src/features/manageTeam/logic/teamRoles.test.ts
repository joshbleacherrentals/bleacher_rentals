import { describe, expect, it } from "vitest";
import { ALL_ROLES, getAvailableRoles, hasNoRoles } from "./teamRoles";

const admin = { isAdmin: true, isAccountManager: false };
const accountManager = { isAdmin: false, isAccountManager: true };
const everyoneElse = { isAdmin: false, isAccountManager: false };

describe("getAvailableRoles", () => {
  it("offers every role to an admin", () => {
    expect(getAvailableRoles([], admin)).toEqual(ALL_ROLES);
  });

  it("includes the accountant role in the list of roles that exist", () => {
    expect(ALL_ROLES).toContain("accountant");
  });

  // The `Developers`, `Maintainers` and `Accountants` tables are admin-only under RLS, and
  // `Users.is_admin` is an admin's call — an offered role the actor cannot save ends in a
  // refused write after the `Users` row already exists.
  it("offers an account manager exactly the roles they are able to save", () => {
    expect(getAvailableRoles([], accountManager)).toEqual(["account-manager", "driver", "viewer"]);
  });

  it.each(["administrator", "developer", "maintainer", "accountant"] as const)(
    "hides %s from an account manager — only an admin grants it",
    (role) => {
      expect(getAvailableRoles([], accountManager)).not.toContain(role);
    },
  );

  it("offers nothing to anyone who is neither an admin nor an account manager", () => {
    expect(getAvailableRoles([], everyoneElse)).toEqual([]);
  });

  it("does not offer a role the user already holds", () => {
    expect(getAvailableRoles(["accountant", "viewer"], admin)).not.toContain("accountant");
    expect(getAvailableRoles(["accountant", "viewer"], admin)).not.toContain("viewer");
    expect(getAvailableRoles(["driver"], accountManager)).toEqual(["account-manager", "viewer"]);
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
