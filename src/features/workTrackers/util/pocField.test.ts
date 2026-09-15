import { describe, it, expect } from "vitest";
import { describePocPopulateResult } from "./pocField";

describe("describePocPopulateResult", () => {
  it("applies a linked contact", () => {
    const result = describePocPopulateResult(
      { kind: "contact", contactUuid: "c-1", displayName: "Jane Smith", source: "event" },
      "past",
    );

    expect(result).toEqual({
      kind: "apply",
      value: { contactUuid: "c-1", pocText: "Jane Smith" },
    });
  });

  it("refuses a legacy free-text POC and names it in the message", () => {
    const result = describePocPopulateResult(
      { kind: "unlinked", displayName: "Bob from the school", source: "workTracker" },
      "past",
    );

    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.messages.join(" ")).toContain("Bob from the school");
    expect(result.kind === "error" && result.messages.join(" ")).toMatch(/create a contact/i);
  });

  it("reports an empty result", () => {
    const result = describePocPopulateResult(null, "past");

    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.messages[0]).toMatch(/previous event/i);
  });

  it("says 'next event' when looking forward", () => {
    const result = describePocPopulateResult(null, "future");

    expect(result.kind === "error" && result.messages[0]).toMatch(/next event/i);
  });
});
