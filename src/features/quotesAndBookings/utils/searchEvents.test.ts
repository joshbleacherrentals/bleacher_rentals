import { describe, it, expect } from "vitest";
import type { AccountsReceivableEvent, QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import { searchEvents, searchReceivables } from "./searchEvents";

function makeEvent(overrides: Partial<QuotesBookingsEvent>): QuotesBookingsEvent {
  return {
    id: "id",
    event_name: null,
    event_start: null,
    event_end: null,
    event_status: null,
    contract_revenue_cents: null,
    tax_amount_cents: null,
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

const events = [
  makeEvent({ id: "a", event_name: "Spring Fair", invoice_number: 242136735 }),
  makeEvent({ id: "b", event_name: "Summer Cup", invoice_number: 242136999 }),
  makeEvent({ id: "c", event_name: "No Invoice Yet" }),
];
const ids = (list: QuotesBookingsEvent[]) => list.map((e) => e.id);

describe("searchEvents — invoice number", () => {
  it("finds a quote by its full invoice number", () => {
    expect(ids(searchEvents(events, "242136735"))).toEqual(["a"]);
  });

  it("finds quotes by a partial invoice number", () => {
    expect(ids(searchEvents(events, "242136"))).toEqual(["a", "b"]);
  });

  it("accepts the number the way the quote prints it, with a leading #", () => {
    expect(ids(searchEvents(events, "#242136735"))).toEqual(["a"]);
    expect(ids(searchEvents(events, "  # 242136735 "))).toEqual(["a"]);
  });

  it("still searches by name", () => {
    expect(ids(searchEvents(events, "summer"))).toEqual(["b"]);
  });
});

describe("searchEvents — amounts", () => {
  // $24,600.00 total with $1,600.00 tax, so the Subtotal column shows $23,000.00.
  const priced = [
    makeEvent({ id: "big", contract_revenue_cents: 2460000, tax_amount_cents: 160000 }),
    makeEvent({ id: "small", contract_revenue_cents: 95000, tax_amount_cents: 0 }),
  ];
  const find = (query: string) => ids(searchEvents(priced, query));

  it("finds an amount typed without the thousands separator", () => {
    expect(find("24600")).toEqual(["big"]);
    expect(find("23000")).toEqual(["big"]);
    expect(find("1600")).toEqual(["big"]);
  });

  it("finds it however the number is written", () => {
    for (const query of ["24,600", "$24,600.00", "$24600", "24600.00", " 24 600 "]) {
      expect(find(query)).toEqual(["big"]);
    }
  });

  it("does not match a different amount", () => {
    expect(find("24601")).toEqual([]);
  });

  it("leaves text searches alone", () => {
    expect(ids(searchEvents(events, "summer"))).toEqual(["b"]);
  });
});

describe("searchReceivables — the AR tabs also search their balances", () => {
  const row = (
    id: string,
    amountDue: number,
    remaining: number,
    overrides: Partial<QuotesBookingsEvent> = {},
  ): AccountsReceivableEvent => ({
    ...makeEvent({ id, ...overrides }),
    amount_due_cents: amountDue,
    remaining_balance_cents: remaining,
  });
  const rows = [
    row("usd", 576300, 1152600),
    row("cad", 98775, 347550, { sales_office_uuid: "cad-office" }),
    row("named", 1000, 2000, { event_name: "Harbor Days Regatta" }),
  ];
  const currencyOf = (e: QuotesBookingsEvent): Currency =>
    e.sales_office_uuid === "cad-office" ? "CAD" : "USD";
  const find = (query: string) => ids(searchReceivables(rows, query, currencyOf));

  it("finds a row by its Amount Due as the table shows it", () => {
    expect(find("$5,763.00")).toEqual(["usd"]);
    expect(find("5,763")).toEqual(["usd"]);
  });

  it("finds a row by its Remaining Balance", () => {
    expect(find("$11,526.00")).toEqual(["usd"]);
    expect(find("C$3,475.50")).toEqual(["cad"]);
  });

  it("matches amounts typed without the thousands separator", () => {
    expect(find("5763")).toEqual(["usd"]);
    expect(find("$5763")).toEqual(["usd"]);
    expect(find("987.75")).toEqual(["cad"]);
  });

  it("still searches everything the list always searched", () => {
    expect(find("harbor")).toEqual(["named"]);
  });

  it("keeps the whole list for an empty query", () => {
    expect(find("  ")).toEqual(["usd", "cad", "named"]);
  });

  it("is not how All Events searches — balances are not searchable there", () => {
    expect(ids(searchEvents(rows, "5,763"))).toEqual([]);
  });
});
