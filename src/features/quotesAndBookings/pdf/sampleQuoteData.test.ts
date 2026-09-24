import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildSampleQuoteData } from "./sampleQuoteData";
import { QuotePublicView } from "./QuotePublicView";

const office = {
  name: "Bleacher Rentals Florida LLC",
  street: "7901 4th Street North",
  zip: "33702",
};

describe("buildSampleQuoteData", () => {
  it("puts the office being edited on the quote", () => {
    const data = buildSampleQuoteData({ ...office, paymentInfo: "ACH info is attached" });
    expect(data.company).toMatchObject({
      name: "Bleacher Rentals Florida LLC",
      street: "7901 4th Street North",
      zip: "33702",
      paymentInfo: "ACH info is attached",
    });
  });

  it("falls back to a placeholder name and no payment info when the form is empty", () => {
    const data = buildSampleQuoteData({ name: "  ", street: "", zip: "", paymentInfo: "  " });
    expect(data.company.name).toBe("Office name");
    expect(data.company.paymentInfo).toBeNull();
  });

  it("is self-consistent, so the whole Approved Quote tab renders from it", () => {
    const data = buildSampleQuoteData({ ...office, paymentInfo: "e-transfers to a@b.com" });
    const scheduled = data.paymentSchedule.reduce((sum, p) => sum + p.amountCents, 0);
    expect(scheduled).toBe(data.totalCents);

    const html = renderToStaticMarkup(createElement(QuotePublicView, { data }));
    expect(html).toContain("Bleacher Rentals Florida LLC");
    expect(html).toContain("e-transfers to a@b.com");
    expect(html).toContain("Rental Items");
    expect(html).toContain("Totals");
  });
});
