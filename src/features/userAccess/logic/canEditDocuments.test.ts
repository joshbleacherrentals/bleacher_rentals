import { describe, it, expect } from "vitest";
import { canAddDocuments, canDeleteDocuments } from "./canEditDocuments";

describe("canAddDocuments", () => {
  it("lets admins and maintainers add a document", () => {
    expect(canAddDocuments({ isAdmin: true, isMaintainer: false })).toBe(true);
    expect(canAddDocuments({ isAdmin: false, isMaintainer: true })).toBe(true);
  });

  it("keeps the button away from everyone else — account managers included", () => {
    expect(canAddDocuments({ isAdmin: false, isMaintainer: false })).toBe(false);
  });
});

describe("canDeleteDocuments", () => {
  it("lets admins and account managers delete, as the database already does", () => {
    expect(canDeleteDocuments({ isAdmin: true, isAccountManager: false })).toBe(true);
    expect(canDeleteDocuments({ isAdmin: false, isAccountManager: true })).toBe(true);
  });

  it("does not let a maintainer-only user delete", () => {
    expect(canDeleteDocuments({ isAdmin: false, isAccountManager: false })).toBe(false);
  });
});
