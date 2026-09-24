import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecksPayableBox } from "./ChecksPayableBox";

const company = {
  name: "Bleacher Rentals Florida LLC",
  street: "7901 4th Street North",
  zip: "33702",
};

const render = (paymentInfo: string | null, language: "en" | "fr" = "en") =>
  renderToStaticMarkup(
    <ChecksPayableBox
      company={company}
      quoteNumber="487597792"
      paymentInfo={paymentInfo}
      language={language}
    />,
  );

describe("ChecksPayableBox", () => {
  it("shows who to pay, the address and the invoice memo", () => {
    const html = render(null);
    expect(html).toContain("Make checks payable to:");
    expect(html).toContain("Bleacher Rentals Florida LLC");
    expect(html).toContain("7901 4th Street North");
    expect(html).toContain("Memo: Invoice #487597792");
  });

  it("shows the office's payment info when it has some", () => {
    expect(render("e-transfers to payments@bleacherrentals.com")).toContain(
      "e-transfers to payments@bleacherrentals.com",
    );
  });

  it("shows no e-transfer line at all when the office has none — e.g. a US office", () => {
    const html = render(null);
    expect(html.toLowerCase()).not.toContain("transfer");
    expect(render("   ").toLowerCase()).not.toContain("transfer");
  });

  it("keeps the line breaks the person typed", () => {
    const html = render("Line one\nLine two");
    expect(html).toContain("whitespace-pre-line");
    expect(html).toContain("Line one\nLine two");
  });

  it("has no highlight by default, and a pulsing outline when asked (the office form preview)", () => {
    expect(render(null)).not.toContain("payment-box-pulse");
    const highlighted = renderToStaticMarkup(
      <ChecksPayableBox
        company={company}
        quoteNumber="1"
        paymentInfo={null}
        language="en"
        highlight
      />,
    );
    expect(highlighted).toContain("payment-box-pulse");
  });

  it("uses the quote's language for the fixed labels", () => {
    expect(render(null, "fr")).toContain("Libeller les chèques à");
  });
});
