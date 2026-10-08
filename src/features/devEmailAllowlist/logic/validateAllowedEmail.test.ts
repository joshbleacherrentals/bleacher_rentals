import { describe, it, expect } from "vitest";
import { validateAllowedEmail } from "./validateAllowedEmail";

const EXISTING = [
  { id: "1", email: "josh@bleacherrentals.com" },
  { id: "2", email: "max@bleacherrentals.com" },
];

describe("validateAllowedEmail", () => {
  it("accepts a new address and returns it trimmed and lower-cased", () => {
    expect(validateAllowedEmail("  New.Person@BleacherRentals.com ", EXISTING)).toEqual({
      ok: true,
      email: "new.person@bleacherrentals.com",
    });
  });

  it("rejects an empty value", () => {
    expect(validateAllowedEmail("   ", EXISTING)).toEqual({
      ok: false,
      error: "Enter an email address.",
    });
  });

  it.each(["josh", "josh@", "@bleacherrentals.com", "josh@bleacherrentals", "a b@c.com"])(
    "rejects %j as not an email address",
    (value) => {
      expect(validateAllowedEmail(value, EXISTING)).toEqual({
        ok: false,
        error: "That doesn't look like an email address.",
      });
    },
  );

  it("rejects a name-and-angle-bracket form — the list holds bare addresses", () => {
    expect(validateAllowedEmail("Josh <josh@bleacherrentals.com>", EXISTING).ok).toBe(false);
  });

  it("rejects a duplicate regardless of case", () => {
    expect(validateAllowedEmail("MAX@bleacherrentals.com", EXISTING)).toEqual({
      ok: false,
      error: "That email is already on the list.",
    });
  });

  it("lets a row keep its own address when it is edited (ignoreId)", () => {
    expect(validateAllowedEmail("josh@bleacherrentals.com", EXISTING, "1")).toEqual({
      ok: true,
      email: "josh@bleacherrentals.com",
    });
  });

  it("still rejects renaming a row to another row's address", () => {
    expect(validateAllowedEmail("max@bleacherrentals.com", EXISTING, "1").ok).toBe(false);
  });
});
