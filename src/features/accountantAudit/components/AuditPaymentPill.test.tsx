import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditPaymentPill } from "./AuditPaymentPill";

// docs/specs/accountant-audit-04-table.md §3 and §5 (D2, R7).

describe("AuditPaymentPill", () => {
  it("draws Paid as a green pill with a check-circle icon", () => {
    const html = renderToStaticMarkup(<AuditPaymentPill payment="paid" />);
    expect(html).toContain('data-testid="audit-payment"');
    expect(html).toContain('data-payment="paid"');
    expect(html).toContain(">Paid<");
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-[#dcede2]");
    expect(html).toContain("text-[#2f6b4c]");
    expect(html).toMatch(/lucide-circle-check/);
  });

  it("draws Not paid as an amber pill with an empty-circle icon", () => {
    const html = renderToStaticMarkup(<AuditPaymentPill payment="not_paid" />);
    expect(html).toContain('data-testid="audit-payment"');
    expect(html).toContain('data-payment="not_paid"');
    expect(html).toContain(">Not paid<");
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-[#fbf0da]");
    expect(html).toContain("text-[#8a6320]");
    expect(html).toMatch(/lucide-circle[ "]/);
    expect(html).not.toMatch(/lucide-circle-check/);
  });

  it("prints the word as well as drawing the icon, so colour is not the only signal", () => {
    expect(renderToStaticMarkup(<AuditPaymentPill payment="paid" />)).not.toContain("sr-only");
    expect(renderToStaticMarkup(<AuditPaymentPill payment="not_paid" />)).toContain("Not paid");
  });

  it("hides the icons from assistive technology and draws them 14px", () => {
    for (const payment of ["paid", "not_paid"] as const) {
      const svg = renderToStaticMarkup(<AuditPaymentPill payment={payment} />).match(
        /<svg[^>]*>/,
      )?.[0];
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('width="14"');
      expect(svg).toContain('height="14"');
    }
  });

  it("draws a dash, no pill and no icon, for none", () => {
    const html = renderToStaticMarkup(<AuditPaymentPill payment="none" />);
    expect(html).toContain('data-testid="audit-payment"');
    expect(html).toContain('data-payment="none"');
    expect(html).toContain(">–<");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("rounded-full");
    expect(html).not.toContain("Paid");
  });
});
