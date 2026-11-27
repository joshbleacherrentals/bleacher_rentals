import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PaymentInstallment } from "../../../types/quoteTypes";
import { buildDefaultPaymentSchedule } from "../../../utils/buildDefaultPaymentSchedule";

// Server rendering reads a zustand store's initial state, so the store is replaced by a plain
// selector over the state each test sets.
let state: Record<string, unknown> = {};
vi.mock("../../../state/useCreateQuoteStore", () => ({
  useCreateQuoteStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
}));

const { PaymentScheduleSection } = await import("./PaymentScheduleSection");

function render(paymentInstallments: PaymentInstallment[]) {
  state = {
    lineItems: [],
    currency: "USD",
    taxPercent: null,
    taxOverrideCents: null,
    scheduleError: null,
    paymentInstallments,
    setField: () => {},
  };
  return renderToStaticMarkup(<PaymentScheduleSection />);
}

describe("PaymentScheduleSection", () => {
  it("shows On signing for the first installment of a new quote, and a date for the second", () => {
    const html = render(buildDefaultPaymentSchedule("2099-08-01", "2099-06-01"));
    expect(html).toContain("On signing");
    expect(html).toContain("Jul 25, 2099");
    expect(html).not.toContain("No date");
  });

  it("shows the day the database wrote once the event has been booked", () => {
    const html = render([
      { id: "a", dueDate: "2026-11-26", percentageBps: 5000, dueOnSigning: true },
      { id: "b", dueDate: "2027-01-10", percentageBps: 5000, dueOnSigning: false },
    ]);
    expect(html).toContain("Nov 26, 2026");
    expect(html).toContain("Jan 10, 2027");
    expect(html).not.toContain("On signing");
  });
});
