import { describe, it, expect } from "vitest";
import { hasQboConnectionsReaderRole } from "./hasQboConnectionsReaderRole";

// docs/specs/vendors-page.md D14: the vendor window picks a QuickBooks connection, so the four
// roles that edit vendors may read the list; a viewer, a developer and a driver may not.
describe("hasQboConnectionsReaderRole", () => {
  it.each(["admin", "accountant", "account_manager", "maintainer"] as const)(
    "allows %s",
    (role) => {
      expect(hasQboConnectionsReaderRole([role])).toBe(true);
    },
  );

  it("allows a person who holds one of them among other roles", () => {
    expect(hasQboConnectionsReaderRole(["viewer", "maintainer"])).toBe(true);
    expect(hasQboConnectionsReaderRole(["driver", "account_manager"])).toBe(true);
  });

  it.each(["viewer", "developer", "driver"] as const)("denies %s alone", (role) => {
    expect(hasQboConnectionsReaderRole([role])).toBe(false);
  });

  it("denies no roles at all", () => {
    expect(hasQboConnectionsReaderRole([])).toBe(false);
  });
});
