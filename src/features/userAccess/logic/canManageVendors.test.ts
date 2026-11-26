import { describe, it, expect } from "vitest";
import { canManageVendors } from "./canManageVendors";

// docs/specs/vendors-page.md D5: admin, account manager, maintainer and accountant create, edit,
// delete and restore vendors; a viewer only reads. A front-end decision only (D6).
describe("canManageVendors", () => {
  it.each(["admin", "account_manager", "maintainer", "accountant"] as const)(
    "allows %s",
    (role) => {
      expect(canManageVendors([role])).toBe(true);
    },
  );

  it.each(["viewer", "developer", "driver"] as const)("does not allow %s alone", (role) => {
    expect(canManageVendors([role])).toBe(false);
  });

  it("allows a person who holds one of the four among other roles", () => {
    expect(canManageVendors(["viewer", "maintainer"])).toBe(true);
    expect(canManageVendors(["driver", "account_manager"])).toBe(true);
  });

  it("does not allow a viewer who is also a developer or a driver", () => {
    expect(canManageVendors(["viewer", "developer"])).toBe(false);
    expect(canManageVendors(["viewer", "driver"])).toBe(false);
  });

  it("does not allow no roles at all", () => {
    expect(canManageVendors([])).toBe(false);
  });
});
