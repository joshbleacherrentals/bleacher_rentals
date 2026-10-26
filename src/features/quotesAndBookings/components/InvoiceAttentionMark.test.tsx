import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { INVOICE_REASON_TEXT } from "../utils/invoiceAttention";
import { InvoiceAttentionMark } from "./InvoiceAttentionMark";

// Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §4 (marks) and §8. The mark is the per-row
// counterpart of the counts: a red dot on the row the count is about, with the reasons on hover.

const draw = (reasons: Parameters<typeof InvoiceAttentionMark>[0]["reasons"]) =>
  renderToStaticMarkup(<InvoiceAttentionMark reasons={reasons} />);

describe("InvoiceAttentionMark", () => {
  it("draws nothing for no reasons", () => {
    expect(draw(undefined)).toBe("");
    expect(draw([])).toBe("");
  });

  it("is a red dot that screen readers and the mouse can both read", () => {
    const html = draw(["dates"]);

    expect(html).toContain('data-testid="invoice-attention-mark"');
    expect(html).toContain('role="img"');
    expect(html).toContain("bg-red-600");
    expect(html).toContain('aria-label="Dates do not match"');
    expect(html).toContain('title="Dates do not match"');
  });

  it.each(Object.entries(INVOICE_REASON_TEXT))(
    "says the short text of the reason %s, spec 09's words",
    (reason, text) => {
      const html = draw([reason as keyof typeof INVOICE_REASON_TEXT]);

      expect(html).toContain(`aria-label="${text.short}"`);
      expect(html).toContain(`title="${text.short}"`);
    },
  );

  it("says all the texts, one per reason and in the order given, when there are several", () => {
    const html = draw(["dates", "totals"]);

    expect(html).toContain('aria-label="Dates do not match, Totals do not match"');
    expect(html).toContain('title="Dates do not match, Totals do not match"');
  });

  it("names the generic reason for a set flag with no reasons", () => {
    expect(draw(["unspecified"])).toContain('title="Invoice does not match the quote"');
  });
});
