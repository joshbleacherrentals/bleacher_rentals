import { describe, it, expect } from "vitest";
import { RECEIVABLES_HELP } from "./receivablesHelp";

// The wording managers were given; changing it is a product decision.
describe("RECEIVABLES_HELP", () => {
  it("explains what the AR tab lists", () => {
    expect(RECEIVABLES_HELP.ar).toBe(
      "Lists events with an amount due that should have been paid by today.",
    );
  });

  it("explains what the AR Deposits tab lists", () => {
    expect(RECEIVABLES_HELP.arDeposits).toBe(
      "Lists events with an amount due that is scheduled to be paid after today.",
    );
  });

  // docs/specs/qbo-invoice-10-need-attention-tab.md: the third tab of /accountant.
  it("explains what the Need attention tab lists and what its Reason column says", () => {
    expect(RECEIVABLES_HELP.needAttention).toBe(
      "Lists quotes whose QuickBooks invoice no longer matches the quote. The Reason column shows what differs.",
    );
  });

  it("explains Amount Due", () => {
    expect(RECEIVABLES_HELP.amountDue).toBe(
      "The amount that should have been paid by today based on the payment schedule.",
    );
  });

  it("explains Remaining Balance", () => {
    expect(RECEIVABLES_HELP.remainingBalance).toBe(
      "The total amount the customer still owes for the event, including future payments.",
    );
  });
});
