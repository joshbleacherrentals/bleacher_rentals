import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_ORDER } from "./permissionPageData";

describe("permission matrix", () => {
  const roles = Object.keys(ROLE_LABELS);

  // ROLE_ORDER is a plain WebRole[], so the compiler does not notice a role
  // missing from it — the role would exist but have no column on /permissions.
  it("lists every role on the page, exactly once", () => {
    expect([...ROLE_ORDER].sort()).toEqual([...roles].sort());
  });

  it("describes every role", () => {
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual([...roles].sort());
  });

  it("answers for every role in every permission", () => {
    for (const entry of PERMISSIONS) {
      expect(Object.keys(entry.roles).sort(), entry.label).toEqual([...roles].sort());
    }
  });

  // Stage 1 of docs/specs/accountant-role.md: the role exists and has no
  // permissions. Giving it one is a separate, approved change — and it should
  // have to edit this test on purpose.
  describe("accountant (Stage 1)", () => {
    it("has no access to anything", () => {
      for (const entry of PERMISSIONS) {
        expect(entry.roles.accountant.level, entry.label).toBe("none");
      }
    });

    it("sits right after the account manager column", () => {
      expect(ROLE_ORDER.indexOf("accountant")).toBe(ROLE_ORDER.indexOf("account_manager") + 1);
    });

    it("tells account managers they cannot grant the role", () => {
      const invite = PERMISSIONS.find((p) => p.label === "Invite Team Members");
      expect(invite?.roles.account_manager.note).toMatch(/Accountant/);
    });
  });
});
