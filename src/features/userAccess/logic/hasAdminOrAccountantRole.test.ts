import { describe, it, expect } from "vitest";
import { hasAdminOrAccountantRole } from "./hasAdminOrAccountantRole";

describe("hasAdminOrAccountantRole", () => {
  it("allows admin", () => {
    expect(hasAdminOrAccountantRole(["admin"])).toBe(true);
  });

  it("allows accountant", () => {
    expect(hasAdminOrAccountantRole(["accountant"])).toBe(true);
  });

  it("allows admin + accountant", () => {
    expect(hasAdminOrAccountantRole(["admin", "accountant"])).toBe(true);
  });

  it("allows an accountant who holds other roles too", () => {
    expect(hasAdminOrAccountantRole(["viewer", "accountant"])).toBe(true);
  });

  it("denies account_manager alone", () => {
    expect(hasAdminOrAccountantRole(["account_manager"])).toBe(false);
  });

  it("denies viewer, maintainer, developer and driver", () => {
    for (const role of ["viewer", "maintainer", "developer", "driver"] as const) {
      expect(hasAdminOrAccountantRole([role]), role).toBe(false);
    }
  });

  it("denies no roles at all", () => {
    expect(hasAdminOrAccountantRole([])).toBe(false);
  });
});
