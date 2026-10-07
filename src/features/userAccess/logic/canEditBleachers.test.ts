import { describe, it, expect } from "vitest";
import { canEditBleachers } from "./canEditBleachers";

describe("canEditBleachers", () => {
  it("lets admins and maintainers add and edit bleachers", () => {
    expect(canEditBleachers({ isAdmin: true, isMaintainer: false })).toBe(true);
    expect(canEditBleachers({ isAdmin: false, isMaintainer: true })).toBe(true);
  });

  it("keeps everyone else read-only — account managers and viewers included", () => {
    expect(canEditBleachers({ isAdmin: false, isMaintainer: false })).toBe(false);
  });
});
