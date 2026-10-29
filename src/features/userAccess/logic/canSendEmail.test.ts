import { describe, expect, it } from "vitest";
import { canSendEmail, CANNOT_SEND_EMAIL_MESSAGE } from "./canSendEmail";

describe("canSendEmail", () => {
  it("allows an admin, an account manager and an accountant", () => {
    for (const role of ["admin", "account_manager", "accountant"] as const) {
      expect(canSendEmail([role]), role).toBe(true);
    }
  });

  it("allows someone who holds one of those roles among others", () => {
    expect(canSendEmail(["viewer", "accountant"])).toBe(true);
    expect(canSendEmail(["driver", "developer", "account_manager"])).toBe(true);
  });

  it("denies a viewer, developer, maintainer and driver", () => {
    for (const role of ["viewer", "developer", "maintainer", "driver"] as const) {
      expect(canSendEmail([role]), role).toBe(false);
    }
    expect(canSendEmail(["viewer", "developer", "maintainer"])).toBe(false);
  });

  it("denies no roles at all, which is what the app holds until sign-in completes", () => {
    expect(canSendEmail([])).toBe(false);
  });

  it("explains a refusal in terms of the person's permission level", () => {
    expect(CANNOT_SEND_EMAIL_MESSAGE).toMatch(/permission level/i);
    expect(CANNOT_SEND_EMAIL_MESSAGE).toMatch(/admins, account managers and accountants/i);
  });
});
