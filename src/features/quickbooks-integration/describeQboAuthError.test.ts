import { describe, it, expect } from "vitest";
import { describeQboAuthError } from "./describeQboAuthError";

describe("describeQboAuthError", () => {
  it("prefers error_description (the actually useful detail intuit-oauth-ts buries)", () => {
    const msg = describeQboAuthError({
      error: "invalid_grant",
      error_description: "Incorrect Token type or clientID",
      originalMessage: "Response has an Error",
      message: "Response has an Error",
    });
    expect(msg).toContain("Incorrect Token type or clientID");
    expect(msg).toContain("Re-authenticate");
    expect(msg).toContain("/quickbooks");
  });

  it("falls back through error, then originalMessage, then message", () => {
    expect(describeQboAuthError({ error: "invalid_grant" })).toContain("invalid_grant");
    expect(describeQboAuthError({ originalMessage: "Response has an Error" })).toContain(
      "Response has an Error",
    );
    expect(describeQboAuthError({ message: "some other message" })).toContain("some other message");
  });

  it("never produces an unhelpful blank reason", () => {
    expect(describeQboAuthError({})).toContain("unknown error");
    expect(describeQboAuthError(null)).toContain("unknown error");
    expect(describeQboAuthError(undefined)).toContain("unknown error");
  });
});
