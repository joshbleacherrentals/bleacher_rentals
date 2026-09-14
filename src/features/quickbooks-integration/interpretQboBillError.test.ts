import { describe, it, expect } from "vitest";
import { interpretQboBillError } from "./interpretQboBillError";

function fault(overrides: { Message?: string; Detail?: string; code?: string; element?: string }) {
  return { Fault: { Error: [overrides], type: "ValidationFault" } };
}

describe("interpretQboBillError", () => {
  it("points at Manage Team → Edit Vendor for a stale vendor id (Names element)", () => {
    const msg = interpretQboBillError(
      fault({
        Message: "Invalid Reference Id",
        Detail: "Invalid Reference Id : Names element id 970 not found",
        code: "2500",
        element: "Reference Id",
      }),
    );
    expect(msg).toContain("Manage Team");
    expect(msg).toContain("970 not found");
  });

  it("points at /work-tracker-types for a stale account id (Accounts element)", () => {
    const msg = interpretQboBillError(
      fault({
        Message: "Invalid Reference Id",
        Detail: "Invalid Reference Id : Accounts element id 437 not found",
        code: "2500",
        element: "Reference Id",
      }),
    );
    expect(msg).toContain("/work-tracker-types");
    expect(msg).toContain("437 not found");
  });

  it("points at /quickbooks for a tax calculation error (code 6000)", () => {
    const msg = interpretQboBillError(
      fault({
        Message: "A business validation error has occurred while processing your request",
        Detail:
          "Business Validation Error: We're sorry, QuickBooks encountered an error while calculating tax.",
        code: "6000",
        element: "",
      }),
    );
    expect(msg).toContain("/quickbooks");
    expect(msg).toContain("calculating tax");
  });

  it("falls back to QBO's own detail text for an unrecognized 2500 (unmapped field)", () => {
    const msg = interpretQboBillError(
      fault({
        Message: "Invalid Reference Id",
        Detail: "Invalid Reference Id : ClassRef element id 999 not found",
        code: "2500",
        element: "Reference Id",
      }),
    );
    expect(msg).toBe("Invalid Reference Id : ClassRef element id 999 not found");
  });

  it("falls back to Message when Detail is missing", () => {
    const msg = interpretQboBillError(fault({ Message: "Something else broke", code: "9999" }));
    expect(msg).toBe("Something else broke");
  });

  it("returns a generic message when there's no Fault at all", () => {
    expect(interpretQboBillError({})).toBe("Failed to create bill in QuickBooks.");
    expect(interpretQboBillError(null)).toBe("Failed to create bill in QuickBooks.");
    expect(interpretQboBillError(undefined)).toBe("Failed to create bill in QuickBooks.");
  });
});
