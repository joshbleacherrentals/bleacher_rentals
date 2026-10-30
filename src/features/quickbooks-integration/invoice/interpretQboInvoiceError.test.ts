import { describe, expect, it } from "vitest";
import { parseQboApiResponseText } from "../parseQboApiResponse";
import { interpretQboInvoiceError } from "./interpretQboInvoiceError";

// docs/specs/qbo-invoice-04-create.md §7: QuickBooks' fault becomes text for the accountant; what the
// function does not know falls back to QuickBooks' own Detail, then Message, then a fixed sentence.

function fault(overrides: { Message?: string; Detail?: string; code?: string; element?: string }) {
  return { Fault: { Error: [overrides], type: "ValidationFault" } };
}

const FALLBACK = "Failed to create invoice in QuickBooks.";

describe("interpretQboInvoiceError", () => {
  it("says QuickBooks could not calculate the tax and to check the event address (code 6000)", () => {
    const text = interpretQboInvoiceError(
      fault({
        Message: "A business validation error has occurred while processing your request",
        Detail:
          "Business Validation Error: We're sorry, QuickBooks encountered an error while calculating tax.",
        code: "6000",
      }),
    );

    expect(text).toContain("could not calculate the tax");
    expect(text).toContain("event address");
    expect(text).toContain("encountered an error while calculating tax");
  });

  it("returns QuickBooks' own Detail for a fault it does not know", () => {
    expect(
      interpretQboInvoiceError(
        fault({
          Message: "Invalid Reference Id",
          Detail: "Invalid Reference Id : ClassRef element id 999 not found",
          code: "2500",
        }),
      ),
    ).toBe("Invalid Reference Id : ClassRef element id 999 not found");
  });

  it("prefers the Detail over the Message", () => {
    expect(interpretQboInvoiceError(fault({ Message: "short", Detail: "long", code: "1" }))).toBe(
      "long",
    );
  });

  it("falls back to the Message when there is no Detail", () => {
    expect(interpretQboInvoiceError(fault({ Message: "Duplicate Document Number Error" }))).toBe(
      "Duplicate Document Number Error",
    );
  });

  it("falls back to the fixed sentence when the fault has neither", () => {
    expect(interpretQboInvoiceError(fault({ code: "1" }))).toBe(FALLBACK);
  });

  it("falls back to the fixed sentence when there is no fault at all", () => {
    expect(interpretQboInvoiceError(null)).toBe(FALLBACK);
    expect(interpretQboInvoiceError(undefined)).toBe(FALLBACK);
    expect(interpretQboInvoiceError({})).toBe(FALLBACK);
    expect(interpretQboInvoiceError({ Fault: { Error: [] } })).toBe(FALLBACK);
  });

  it("passes on the text parseQboApiResponse gives a platform error page (504 and the like)", () => {
    const page = parseQboApiResponseText("An error occurred with your deployment", 504);

    const text = interpretQboInvoiceError(page);

    expect(text).toBe(page.error);
    expect(text).toContain("504");
  });

  it("passes on the text for any other platform error page too", () => {
    const page = parseQboApiResponseText("<html>Bad Gateway</html>", 502);

    expect(interpretQboInvoiceError(page)).toBe(page.error);
  });
});
