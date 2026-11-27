import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";

// The real primitives draw to a PDF canvas. Swap them for plain elements so the document's
// text can be read back from markup: this test is about what the header says, not the layout.
vi.mock("@react-pdf/renderer", () => {
  const box = (tag: string) => {
    const Box = ({ children }: { children?: ReactNode }) => createElement(tag, null, children);
    return Box;
  };
  // A PDF Link carries its target in `src`; as markup that is an anchor's href.
  const Link = ({ children, src }: { children?: ReactNode; src?: string }) =>
    createElement("a", { href: src }, children);
  return {
    Document: box("div"),
    Page: box("div"),
    View: box("div"),
    Text: box("span"),
    Link,
    StyleSheet: { create: <T,>(styles: T) => styles },
    Font: { register: () => undefined },
  };
});

import { QuotePdfDocument } from "./QuotePdfDocument";
import { buildSampleQuoteData } from "./sampleQuoteData";

const office = { name: "Bleacher Rentals", street: "2454 Nixon Road", zip: "N3Y 4K6" };

/** A sample quote whose sales office has the given phone ("" = none on file). */
const dataWithPhone = (phone: string, language: "en" | "fr" = "en") => {
  const data = buildSampleQuoteData({ ...office, paymentInfo: "" });
  return { ...data, language, company: { ...data.company, phone } };
};

const render = (data: ReturnType<typeof dataWithPhone>) =>
  renderToStaticMarkup(createElement(QuotePdfDocument, { data }));

describe("QuotePdfDocument header", () => {
  it("shows the sales office's phone under its address", () => {
    const html = render(dataWithPhone("(519) 555-0142"));
    expect(html).toContain("P: (519) 555-0142");
    // Under the address, before anything else on the page.
    expect(html.indexOf("2454 Nixon Road")).toBeLessThan(html.indexOf("(519) 555-0142"));
    expect(html.indexOf("(519) 555-0142")).toBeLessThan(html.indexOf("Bill To"));
  });

  it("shows the phone even when the office has no street address on file", () => {
    const data = dataWithPhone("(519) 555-0142");
    const html = render({ ...data, company: { ...data.company, street: "" } });
    expect(html).toContain("P: (519) 555-0142");
  });

  it("uses the French prefix on a French document", () => {
    const html = render(dataWithPhone("(519) 555-0142", "fr"));
    expect(html).toContain("T : (519) 555-0142");
  });

  it("leaves the line out when the office has no phone", () => {
    const html = render(dataWithPhone(""));
    expect(html).not.toContain("P:");
  });
});

describe("QuotePdfDocument Pay now button", () => {
  const sample = dataWithPhone("");
  const customerPage = `https://app.example.com/quote/${sample.eventId}`;

  /** Every anchor in the document, as [href, visible text]. */
  const links = (html: string) =>
    [...html.matchAll(/<a href="([^"]*)">(.*?)<\/a>/g)].map((m) => [
      m[1],
      m[2].replace(/<[^>]+>/g, ""),
    ]);

  it("links to the customer's quote page", () => {
    const html = render({ ...sample, publicUrl: customerPage });
    expect(links(html)).toEqual([[customerPage, "Pay now"]]);
  });

  it("is on a quote and on an invoice alike", () => {
    for (const status of ["quoted", "booked"]) {
      const html = render({ ...sample, status, publicUrl: customerPage });
      expect(links(html), `status ${status}`).toEqual([[customerPage, "Pay now"]]);
    }
  });

  it("is in French on a French document", () => {
    const html = render({ ...dataWithPhone("", "fr"), publicUrl: customerPage });
    expect(links(html)).toEqual([[customerPage, "Payer maintenant"]]);
  });

  it("sits after the totals, so the customer reads the amount first", () => {
    const html = render({ ...sample, publicUrl: customerPage });
    expect(html.indexOf("TOTAL")).toBeLessThan(html.indexOf("Pay now"));
  });

  it("is left out when the address is not a full web link", () => {
    // A relative or empty link is dead inside a PDF; no button beats a button that does nothing.
    for (const publicUrl of ["", `/quote/${sample.eventId}`]) {
      expect(links(render({ ...sample, publicUrl })), `url "${publicUrl}"`).toEqual([]);
    }
  });
});
