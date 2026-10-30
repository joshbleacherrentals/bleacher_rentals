import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceDataFixture } from "./invoiceFixtures";
import { MONEY_HELP, MoneyCard } from "./MoneyCard";

const money = invoiceDataFixture().money;
const render = () => renderToStaticMarkup(<MoneyCard money={money} currency="CAD" />);

describe("MoneyCard", () => {
  it("shows the six lines with their amounts", () => {
    const html = render();
    for (const text of [
      "Contract Subtotal",
      "C$11,254.78",
      "Taxes (15%)",
      "C$1,688.22",
      ">Total<",
      "C$12,943.00",
      "Already paid",
      "C$4,735.75",
      "Remaining Payment",
      "C$8,207.25",
      "Current Overdue amount",
      "C$1,735.75",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("puts an (i) on every line but Taxes", () => {
    const html = render();
    for (const label of [
      "About Contract Subtotal",
      "About Total",
      "About Already paid",
      "About Remaining Payment",
      "About Current Overdue amount",
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain('aria-label="About Taxes');
  });

  it("explains each line in its own words", () => {
    expect(MONEY_HELP.contractSubtotal).toBe("Total after discounts, not including taxes.");
    expect(MONEY_HELP.total).toBe("Total after discounts, including taxes.");
    expect(MONEY_HELP.alreadyPaid).toBe("Funds that have been credited as of now.");
    expect(MONEY_HELP.remaining).toMatch(/minus what is already paid/);
    expect(MONEY_HELP.currentOverdue).toMatch(/3,000/);
  });

  it("draws Current Overdue in a red box", () => {
    expect(render()).toMatch(/class="[^"]*bg-red-100[^"]*"[^>]*>[^]*Current Overdue amount/);
  });

  it("falls back to the plain label when the tax rate is unknown", () => {
    const html = renderToStaticMarkup(
      <MoneyCard money={{ ...money, taxesLabel: "Taxes" }} currency="CAD" />,
    );
    expect(html).toContain(">Taxes<");
  });
});
