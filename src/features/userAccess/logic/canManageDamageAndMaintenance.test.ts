import { describe, it, expect } from "vitest";
import { canManageDamageAndMaintenance } from "./canManageDamageAndMaintenance";

describe("canManageDamageAndMaintenance", () => {
  it("lets admins and maintainers edit, delete and restore damage reports and repairs", () => {
    expect(canManageDamageAndMaintenance({ isAdmin: true, isMaintainer: false })).toBe(true);
    expect(canManageDamageAndMaintenance({ isAdmin: false, isMaintainer: true })).toBe(true);
  });

  it("does not open it to anyone else — account managers keep today's admin-only buttons", () => {
    expect(canManageDamageAndMaintenance({ isAdmin: false, isMaintainer: false })).toBe(false);
  });
});
