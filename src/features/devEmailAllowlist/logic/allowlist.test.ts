import { describe, it, expect } from "vitest";
import {
  applyAllowlistToToAndCc,
  emailAddressOf,
  isDevEmailRestricted,
  splitByAllowlist,
  splitRecipients,
} from "./allowlist";

const ALLOWED = new Set(["josh@bleacherrentals.com", "max@bleacherrentals.com"]);

describe("isDevEmailRestricted", () => {
  it("is on for the environment that shows the green Development banner", () => {
    expect(isDevEmailRestricted("development")).toBe(true);
  });

  it.each([undefined, "", "staging", "production", "Development"])(
    "is off for %j — only the exact value 'development' restricts",
    (env) => {
      expect(isDevEmailRestricted(env)).toBe(false);
    },
  );
});

describe("emailAddressOf", () => {
  it("lower-cases and trims a bare address", () => {
    expect(emailAddressOf("  Josh@BleacherRentals.com ")).toBe("josh@bleacherrentals.com");
  });

  it("takes the address out of a 'Name <address>' recipient", () => {
    expect(emailAddressOf("Sam Rivera <Sam@BleacherRentals.com>")).toBe("sam@bleacherrentals.com");
  });
});

describe("splitRecipients", () => {
  it("splits a comma separated To header and drops blanks", () => {
    expect(splitRecipients("a@x.com, b@x.com,, ")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("is empty for null and for an empty string", () => {
    expect(splitRecipients(null)).toEqual([]);
    expect(splitRecipients("")).toEqual([]);
  });
});

describe("splitByAllowlist", () => {
  it("separates allowed from blocked, matching case-insensitively", () => {
    const result = splitByAllowlist(
      ["JOSH@bleacherrentals.com", "abby@bleacherrentals.com", "Max <max@bleacherrentals.com>"],
      ALLOWED,
    );
    expect(result.allowed).toEqual(["JOSH@bleacherrentals.com", "Max <max@bleacherrentals.com>"]);
    expect(result.blocked).toEqual(["abby@bleacherrentals.com"]);
  });

  it("blocks everything against an empty list", () => {
    const result = splitByAllowlist(["josh@bleacherrentals.com"], new Set());
    expect(result.allowed).toEqual([]);
    expect(result.blocked).toEqual(["josh@bleacherrentals.com"]);
  });

  it("does not treat a lookalike domain as allowed", () => {
    const result = splitByAllowlist(["josh@bleacherrentals.com.evil.io"], ALLOWED);
    expect(result.blocked).toEqual(["josh@bleacherrentals.com.evil.io"]);
  });
});

describe("applyAllowlistToToAndCc", () => {
  it("keeps To and drops only a blocked finance CC — the mistake that started this", () => {
    const result = applyAllowlistToToAndCc(
      { to: ["josh@bleacherrentals.com"], cc: ["finance@bleacherrentals.com"] },
      ALLOWED,
    );
    expect(result).toEqual({
      to: ["josh@bleacherrentals.com"],
      cc: [],
      blocked: ["finance@bleacherrentals.com"],
    });
  });

  it("promotes an allowed CC to To when the To is blocked, so the send still has a recipient", () => {
    const result = applyAllowlistToToAndCc(
      { to: ["abby@bleacherrentals.com"], cc: ["max@bleacherrentals.com"] },
      ALLOWED,
    );
    expect(result).toEqual({
      to: ["max@bleacherrentals.com"],
      cc: [],
      blocked: ["abby@bleacherrentals.com"],
    });
  });

  it("leaves nothing to send when every recipient is blocked", () => {
    const result = applyAllowlistToToAndCc(
      { to: ["abby@bleacherrentals.com"], cc: ["finance@bleacherrentals.com"] },
      ALLOWED,
    );
    expect(result.to).toEqual([]);
    expect(result.cc).toEqual([]);
    expect(result.blocked).toEqual(["abby@bleacherrentals.com", "finance@bleacherrentals.com"]);
  });

  it("changes nothing when everyone is allowed", () => {
    const result = applyAllowlistToToAndCc(
      { to: ["josh@bleacherrentals.com"], cc: ["max@bleacherrentals.com"] },
      ALLOWED,
    );
    expect(result).toEqual({
      to: ["josh@bleacherrentals.com"],
      cc: ["max@bleacherrentals.com"],
      blocked: [],
    });
  });
});
