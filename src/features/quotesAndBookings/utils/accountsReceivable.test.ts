import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import {
  eventTotalCents,
  isOnReceivablesTab,
  receivablesByTab,
  withReceivableBalances,
  type ReceivableInstallmentRow,
  type ReceivablePaymentRow,
  type ReceivableSources,
} from "./accountsReceivable";

const TODAY = "2026-09-25";

function makeEvent(overrides: Partial<QuotesBookingsEvent>): QuotesBookingsEvent {
  return {
    id: "id",
    event_name: null,
    event_start: null,
    event_end: null,
    event_status: "booked",
    contract_revenue_cents: null,
    tax_amount_cents: 0,
    tax_percent: null,
    created_at: null,
    booked_at: null,
    created_by_user_uuid: null,
    goodshuffle_url: null,
    is_qbo: null,
    sales_office_uuid: null,
    deleted: 0,
    invoice_number: null,
    account_manager_first_name: null,
    account_manager_last_name: null,
    account_manager_email: null,
    address_street: null,
    address_city: null,
    address_state: null,
    contact_first_name: null,
    contact_last_name: null,
    contact_email: null,
    company_name: null,
    ...overrides,
  };
}

function installment(
  eventId: string,
  id: string,
  dueDate: string,
  percentageBps: number,
): ReceivableInstallmentRow {
  return { id, event_uuid: eventId, due_date: dueDate, percentage_bps: percentageBps };
}

function payment(
  eventId: string,
  id: string,
  amountCents: number,
  overrides: Partial<ReceivablePaymentRow> = {},
): ReceivablePaymentRow {
  return {
    id,
    event_uuid: eventId,
    installment_id: null,
    amount_cents: amountCents,
    currency: "USD",
    status: "succeeded",
    paid_at: "2026-09-10 12:00:00+00",
    created_at: "2026-09-10 12:00:00+00",
    ...overrides,
  };
}

const usd = (): Currency => "USD";

/**
 * The worked example from the task, on a $4,000 event:
 *   #1 $2,000 due Sep 1  — paid Sep 10
 *   #2 $1,000 due Sep 20 — overdue, unpaid
 *   #3 $1,000 due Oct 1  — not due yet
 * On Sep 25 the client owes $2,000 in total, of which $1,000 is due now.
 */
function exampleSources(eventId: string): ReceivableSources {
  return {
    lineTotals: [{ event_uuid: eventId, line_total_cents: 400000 }],
    installments: [
      installment(eventId, `${eventId}-1`, "2026-09-01", 5000),
      installment(eventId, `${eventId}-2`, "2026-09-20", 2500),
      installment(eventId, `${eventId}-3`, "2026-10-01", 2500),
    ],
    payments: [payment(eventId, `${eventId}-p1`, 200000, { installment_id: `${eventId}-1` })],
  };
}

const balancesOf = (
  event: QuotesBookingsEvent,
  sources: ReceivableSources,
  currencyOf: (e: QuotesBookingsEvent) => Currency = usd,
) => {
  const [row] = withReceivableBalances([event], sources, currencyOf, TODAY);
  return { due: row.amount_due_cents, remaining: row.remaining_balance_cents };
};

describe("eventTotalCents", () => {
  it("is the line items plus the tax the quote was saved with", () => {
    expect(eventTotalCents(100000, { tax_amount_cents: 13000, tax_percent: 5 })).toBe(113000);
  });

  it("falls back to the tax rate when no amount was stored, like the quote document", () => {
    expect(eventTotalCents(100000, { tax_amount_cents: null, tax_percent: 13 })).toBe(113000);
  });

  it("is just the line items when there is no tax at all", () => {
    expect(eventTotalCents(100000, { tax_amount_cents: null, tax_percent: null })).toBe(100000);
  });
});

describe("withReceivableBalances", () => {
  it("separates what is owed in total from what is already due (the Sep 25 example)", () => {
    expect(balancesOf(makeEvent({ id: "a" }), exampleSources("a"))).toEqual({
      due: 100000,
      remaining: 200000,
    });
  });

  it("counts an untargeted payment against the oldest installment first", () => {
    const sources: ReceivableSources = {
      ...exampleSources("a"),
      payments: [payment("a", "p1", 250000)],
    };
    // $2,500 covers #1 and half of #2, so $500 of #2 is still overdue.
    expect(balancesOf(makeEvent({ id: "a" }), sources)).toEqual({
      due: 50000,
      remaining: 150000,
    });
  });

  it("treats an event with no payment schedule as due in full", () => {
    const sources: ReceivableSources = {
      lineTotals: [{ event_uuid: "a", line_total_cents: 50000 }],
      installments: [],
      payments: [payment("a", "p1", 10000)],
    };
    expect(balancesOf(makeEvent({ id: "a" }), sources)).toEqual({
      due: 40000,
      remaining: 40000,
    });
  });

  it("does not count payments that failed or were made in another currency", () => {
    const sources: ReceivableSources = {
      ...exampleSources("a"),
      payments: [
        payment("a", "p1", 200000, { status: "failed" }),
        payment("a", "p2", 200000, { currency: "USD" }),
      ],
    };
    // The event is priced in CAD, so neither payment reduces its balance.
    expect(balancesOf(makeEvent({ id: "a" }), sources, () => "CAD")).toEqual({
      due: 300000,
      remaining: 400000,
    });
  });

  it("keeps each event's schedule and payments to itself", () => {
    const a = exampleSources("a");
    const b = exampleSources("b");
    const sources: ReceivableSources = {
      lineTotals: [...a.lineTotals, ...b.lineTotals],
      installments: [...a.installments, ...b.installments],
      // Event b is paid off entirely; none of that belongs to a.
      payments: [...a.payments, payment("b", "b-p2", 400000)],
    };
    const rows = withReceivableBalances(
      [makeEvent({ id: "a" }), makeEvent({ id: "b" })],
      sources,
      usd,
      TODAY,
    );
    expect(rows.map((r) => [r.id, r.amount_due_cents, r.remaining_balance_cents])).toEqual([
      ["a", 100000, 200000],
      ["b", 0, 0],
    ]);
  });

  it("owes nothing on an event without line items", () => {
    const sources: ReceivableSources = {
      lineTotals: [],
      installments: [installment("a", "i1", "2026-09-01", 10000)],
      payments: [],
    };
    expect(balancesOf(makeEvent({ id: "a" }), sources)).toEqual({ due: 0, remaining: 0 });
  });

  it("never goes negative when the client overpaid", () => {
    const sources: ReceivableSources = {
      ...exampleSources("a"),
      payments: [payment("a", "p1", 500000)],
    };
    expect(balancesOf(makeEvent({ id: "a" }), sources)).toEqual({ due: 0, remaining: 0 });
  });

  it("does not throw when discounts outweigh the line items", () => {
    const sources: ReceivableSources = {
      lineTotals: [{ event_uuid: "a", line_total_cents: -5000 }],
      installments: [installment("a", "i1", "2026-09-01", 10000)],
      payments: [],
    };
    expect(balancesOf(makeEvent({ id: "a" }), sources)).toEqual({ due: 0, remaining: 0 });
  });

  it("keeps the event's own fields on the row", () => {
    const [row] = withReceivableBalances(
      [makeEvent({ id: "a", event_name: "Fall Classic", invoice_number: 1042 })],
      exampleSources("a"),
      usd,
      TODAY,
    );
    expect(row).toMatchObject({ id: "a", event_name: "Fall Classic", invoice_number: 1042 });
  });
});

describe("isOnReceivablesTab", () => {
  it("puts events that started on or before today on AR", () => {
    expect(isOnReceivablesTab(makeEvent({ event_start: "2026-09-01" }), "ar", TODAY)).toBe(true);
    expect(isOnReceivablesTab(makeEvent({ event_start: TODAY }), "ar", TODAY)).toBe(true);
    expect(isOnReceivablesTab(makeEvent({ event_start: "2026-09-26" }), "ar", TODAY)).toBe(false);
  });

  it("puts events starting after today on AR Deposits", () => {
    const deposits = (start: string) =>
      isOnReceivablesTab(makeEvent({ event_start: start }), "ar_deposits", TODAY);
    expect(deposits("2026-09-26")).toBe(true);
    expect(deposits(TODAY)).toBe(false);
    expect(deposits("2026-09-01")).toBe(false);
  });

  it("only counts booked events — an unsigned quote is not receivable", () => {
    for (const status of ["quoted", "lost", null]) {
      const event = makeEvent({ event_status: status, event_start: "2026-09-01" });
      expect(isOnReceivablesTab(event, "ar", TODAY)).toBe(false);
    }
    expect(
      isOnReceivablesTab(
        makeEvent({ event_status: "Booked", event_start: "2026-09-01" }),
        "ar",
        TODAY,
      ),
    ).toBe(true);
  });

  it("leaves an event without a start date off both tabs", () => {
    expect(isOnReceivablesTab(makeEvent({ event_start: null }), "ar", TODAY)).toBe(false);
    expect(isOnReceivablesTab(makeEvent({ event_start: null }), "ar_deposits", TODAY)).toBe(false);
  });
});

describe("receivablesByTab", () => {
  const sources: ReceivableSources = {
    lineTotals: ["past", "future", "quoted", "paid", "notYet"].map((id) => ({
      event_uuid: id,
      line_total_cents: 400000,
    })),
    installments: [
      ...exampleSources("past").installments,
      ...exampleSources("future").installments,
      ...exampleSources("quoted").installments,
      ...exampleSources("paid").installments,
      // Nothing on this one is due until next month.
      installment("notYet", "notYet-1", "2026-10-15", 10000),
    ],
    payments: [
      ...exampleSources("past").payments,
      ...exampleSources("future").payments,
      payment("paid", "paid-p1", 300000),
    ],
  };

  const events = [
    makeEvent({ id: "past", event_start: "2026-09-20" }),
    makeEvent({ id: "future", event_start: "2026-10-10" }),
    makeEvent({ id: "quoted", event_status: "quoted", event_start: "2026-09-20" }),
    // $1,000 still to pay, but none of it is due yet.
    makeEvent({ id: "paid", event_start: "2026-09-20" }),
    makeEvent({ id: "notYet", event_start: "2026-10-20" }),
  ];

  const byTab = () => receivablesByTab(events, sources, usd, TODAY);
  const idsOn = (tab: "ar" | "ar_deposits") => byTab()[tab].map((r) => r.id);

  it("AR lists booked events that have started and have an amount due", () => {
    expect(idsOn("ar")).toEqual(["past"]);
  });

  it("AR Deposits lists booked future events that have an amount due", () => {
    expect(idsOn("ar_deposits")).toEqual(["future"]);
  });

  it("carries both balances on each row", () => {
    const [row] = byTab().ar;
    expect(row.amount_due_cents).toBe(100000);
    expect(row.remaining_balance_cents).toBe(200000);
  });

  it("works out every balance once for both tabs, not once per tab", () => {
    // Both tabs come from one call, so switching between them never re-runs the allocation.
    const { ar, ar_deposits } = byTab();
    expect([...ar, ...ar_deposits].map((r) => r.id).sort()).toEqual(["future", "past"]);
  });
});
