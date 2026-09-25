import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "../types";
import { searchEvents } from "./searchEvents";

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
