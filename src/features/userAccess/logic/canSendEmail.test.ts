import { describe, expect, it } from "vitest";
import {
  canSendEmail,
  CANNOT_SEND_EMAIL_MESSAGE,
  emailSendBlock,
  NOT_COMPANY_EMAIL_MESSAGE,
} from "./canSendEmail";

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

  it("explains a refusal in terms of permission, and who can send", () => {
    expect(CANNOT_SEND_EMAIL_MESSAGE).toMatch(/permission/i);
    expect(CANNOT_SEND_EMAIL_MESSAGE).toMatch(/admins, account managers and accountants/i);
  });
});

describe("emailSendBlock", () => {
  it("has no reason when the role may send and the email is on the company domain", () => {
    expect(emailSendBlock({ roles: ["admin"], email: "josh@bleacherrentals.com" })).toBeNull();
    expect(
      emailSendBlock({ roles: ["account_manager"], email: "Sam@BleacherRentals.com" }),
    ).toBeNull();
  });

  it("names the role first when the role may not send, whatever the email", () => {
    expect(emailSendBlock({ roles: ["viewer"], email: "pat@bleacherrentals.com" })).toBe(
      CANNOT_SEND_EMAIL_MESSAGE,
    );
    expect(emailSendBlock({ roles: ["viewer"], email: "pat@gmail.com" })).toBe(
      CANNOT_SEND_EMAIL_MESSAGE,
    );
    expect(emailSendBlock({ roles: [], email: undefined })).toBe(CANNOT_SEND_EMAIL_MESSAGE);
  });

  it("names the email when the role may send but the account is not on the company domain", () => {
    for (const email of [
      "redgriftjosh@gmail.com",
      "josh@example.com",
      "josh@bleacherrentals.com.evil.co",
      null,
    ]) {
      expect(emailSendBlock({ roles: ["admin"], email }), String(email)).toBe(
        NOT_COMPANY_EMAIL_MESSAGE,
      );
    }
  });

  it("does not hold the email against anyone while it is still loading", () => {
    expect(emailSendBlock({ roles: ["admin"], email: undefined })).toBeNull();
  });

  it("words the email reason around the company domain", () => {
    expect(NOT_COMPANY_EMAIL_MESSAGE).toContain("@bleacherrentals.com");
  });
});
