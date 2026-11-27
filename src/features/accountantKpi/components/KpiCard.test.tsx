import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KpiCard } from "./KpiCard";

// docs/specs/accountant-kpi.md §2.1 and §2.4: the title with an (i), the value large, the count
// under it; while loading or on a dash the count is left out.

const props = {
  title: "Days to collect Deposit",
  hint: "How the number is worked out.",
  testId: "kpi-card-deposit",
};

describe("KpiCard", () => {
  it("shows the title, the value and the count, under the test id it was given", () => {
    const html = renderToStaticMarkup(<KpiCard {...props} value="10 days" detail="3 payments" />);
    expect(html).toContain('data-testid="kpi-card-deposit"');
    expect(html).toContain("Days to collect Deposit");
    expect(html).toContain('data-testid="kpi-card-deposit-value"');
    expect(html).toContain(">10 days<");
    expect(html).toContain('data-testid="kpi-card-deposit-detail"');
    expect(html).toContain(">3 payments<");
  });

  it("has an (i) named after the card, so a screen reader says what it explains", () => {
    const html = renderToStaticMarkup(<KpiCard {...props} value="10 days" detail="3 payments" />);
    expect(html).toContain('aria-label="About Days to collect Deposit"');
  });

  it("leaves the count out when there is none to show", () => {
    const html = renderToStaticMarkup(<KpiCard {...props} value="Loading..." />);
    expect(html).toContain(">Loading...<");
    expect(html).not.toContain("-detail");
  });

  it("two cards keep their own test ids", () => {
    const html = renderToStaticMarkup(
      <>
        <KpiCard {...props} value="1 day" detail="1 payment" />
        <KpiCard
          {...props}
          title="Days to collect Final Payment"
          testId="kpi-card-final"
          value="–"
          detail="0 payments"
        />
      </>,
    );
    expect(html).toContain('data-testid="kpi-card-deposit-value"');
    expect(html).toContain('data-testid="kpi-card-final-value"');
    expect(html).toContain(">–<");
  });
});
