import { describe, expect, it } from "vitest";
import { qboInvoiceUrl } from "./qboInvoiceUrl";

// Spec: docs/specs/qbo-invoice-08-view-and-check.md §2 (the address of an invoice's page) and §3
// (the pure function; only the two known environments are accepted).

describe("qboInvoiceUrl", () => {
  it("production: the invoice page on app.qbo.intuit.com", () => {
    expect(qboInvoiceUrl("production", "145")).toBe(
      "https://app.qbo.intuit.com/app/invoice?txnId=145",
    );
  });

  it("sandbox: the same path on app.sandbox.qbo.intuit.com", () => {
    expect(qboInvoiceUrl("sandbox", "145")).toBe(
      "https://app.sandbox.qbo.intuit.com/app/invoice?txnId=145",
    );
  });

  it("encodes an id with unusual characters, so it cannot add a parameter or change the path", () => {
    const url = qboInvoiceUrl("production", "a b&c=d/é#x");

    expect(url).toBe(
      `https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent("a b&c=d/é#x")}`,
    );
    expect(new URL(url).searchParams.get("txnId")).toBe("a b&c=d/é#x");
    expect(new URL(url).host).toBe("app.qbo.intuit.com");
  });

  it.each([undefined, null, "", "Production", "SANDBOX", "staging", " sandbox"])(
    "any other environment (%j) throws",
    (environment) => {
      expect(() => qboInvoiceUrl(environment as string | undefined, "145")).toThrow();
    },
  );
});
