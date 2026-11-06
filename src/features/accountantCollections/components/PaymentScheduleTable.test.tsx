import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceDataFixture } from "./invoiceFixtures";
import { PaymentScheduleTable } from "./PaymentScheduleTable";

const schedule = invoiceDataFixture().schedule;
const render = (rows = schedule) => renderToStaticMarkup(<PaymentScheduleTable schedule={rows} />);

describe("PaymentScheduleTable", () => {
  it("has the five columns of the design", () => {
    const html = render();
    for (const header of ["#", "Due Date", "Amount", "Status", "Paid at"]) {
      expect(html).toContain(`>${header}<`);
    }
  });

  it("draws a row per installment, with its date and amount", () => {
    const html = render();
    expect(html).toContain("Aug 30, 2026");
    expect(html).toContain("Nov 7, 2026");
    expect(html).toContain("Nov 14, 2026");
    expect(html.match(/C\$3,235\.75/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("gives Paid, Partial and Unpaid their chips", () => {
    const html = render();
    expect(html).toMatch(/bg-green-100[^>]*>Paid</);
    expect(html).toMatch(/bg-amber-100[^>]*>Partial</);
    expect(html).toMatch(/bg-yellow-100[^>]*>Unpaid</);
  });

  it("says how far a Partial row got", () => {
    expect(render()).toContain("C$1,500.00 of C$3,235.75");
  });

  it("shows when a Paid row was paid, and a dash otherwise", () => {
    const html = render();
    expect(html).toContain("Aug 29, 2026 at 3:14 PM");
    expect(html.match(/>—</g)).toHaveLength(2);
  });

  it("says so when there is no schedule", () => {
    expect(render([])).toContain("No payment schedule set.");
  });
});
