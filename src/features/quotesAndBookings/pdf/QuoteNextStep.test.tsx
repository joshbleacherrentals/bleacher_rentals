import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaidInFullNote, QuoteCtaButton, QuoteCtaStickyBar } from "./QuoteNextStep";

describe("QuoteCtaButton", () => {
  it("says Approve Quote or Pay Invoice, in the customer's language", () => {
    const render = (kind: "approve" | "pay", language: "en" | "fr") =>
      renderToStaticMarkup(<QuoteCtaButton kind={kind} language={language} onClick={() => {}} />);
    expect(render("approve", "en")).toContain(">Approve Quote<");
    expect(render("pay", "en")).toContain(">Pay Invoice<");
    expect(render("approve", "fr")).toContain(">Approuver le devis<");
    expect(render("pay", "fr")).toContain(">Payer la facture<");
  });

  it("is a real button that does not submit a form", () => {
    const html = renderToStaticMarkup(
      <QuoteCtaButton kind="approve" language="en" onClick={() => {}} />,
    );
    expect(html).toContain('<button type="button"');
  });

  it("is the same green as the header's QUOTE / INVOICE badge, with no hard-coded hex", () => {
    const html = renderToStaticMarkup(
      <QuoteCtaButton kind="approve" language="en" onClick={() => {}} />,
    );
    expect(html).toContain("bg-green-700");
    expect(html).not.toMatch(/bg-\[#/);
  });

  it("takes custom wording, for Continue to Payment after signing", () => {
    const html = renderToStaticMarkup(
      <QuoteCtaButton kind="pay" language="en" label="Continue to Payment" onClick={() => {}} />,
    );
    expect(html).toContain(">Continue to Payment<");
    expect(html).not.toContain(">Pay Invoice<");
  });
});

describe("QuoteCtaStickyBar", () => {
  const html = renderToStaticMarkup(
    <QuoteCtaStickyBar kind="approve" language="en" onClick={() => {}} />,
  );

  it("is pinned to the bottom on a phone and gone from the sm breakpoint up", () => {
    expect(html).toContain("fixed inset-x-0 bottom-0");
    expect(html).toContain("sm:hidden");
  });

  it("clears the home indicator on phones that have one", () => {
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("holds a full-width button", () => {
    expect(html).toContain("w-full");
    expect(html).toContain(">Approve Quote<");
  });
});

describe("PaidInFullNote", () => {
  it("is a note, not a button", () => {
    const html = renderToStaticMarkup(<PaidInFullNote language="en" />);
    expect(html).toContain("Paid in Full");
    expect(html).not.toContain("<button");
  });
});
