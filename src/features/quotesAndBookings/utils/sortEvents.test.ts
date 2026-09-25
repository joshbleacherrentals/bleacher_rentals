import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "../types";
import {
  sortEvents,
  nextSort,
  parseSort,
  serializeSort,
  DEFAULT_SORT,
  type EventSort,
} from "./sortEvents";

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

const ids = (events: QuotesBookingsEvent[]) => events.map((e) => e.id);
const sortBy = (events: QuotesBookingsEvent[], sort: EventSort) => ids(sortEvents(events, sort));

describe("sortEvents", () => {
  it("defaults to newest created first", () => {
    const events = [
      makeEvent({ id: "old", created_at: "2025-01-01T00:00:00Z" }),
      makeEvent({ id: "new", created_at: "2025-06-01T00:00:00Z" }),
      makeEvent({ id: "mid", created_at: "2025-03-01T00:00:00Z" }),
    ];
    expect(sortBy(events, DEFAULT_SORT)).toEqual(["new", "mid", "old"]);
    expect(sortBy(events, { key: "created_at", direction: "asc" })).toEqual(["old", "mid", "new"]);
  });

  it("sorts event names alphabetically, ignoring case, both ways", () => {
    const events = [
      makeEvent({ id: "b", event_name: "banana Fest" }),
      makeEvent({ id: "a", event_name: "Apple Day" }),
      makeEvent({ id: "c", event_name: "Cherry Cup" }),
    ];
    expect(sortBy(events, { key: "event_name", direction: "asc" })).toEqual(["a", "b", "c"]);
    expect(sortBy(events, { key: "event_name", direction: "desc" })).toEqual(["c", "b", "a"]);
  });

  it("sorts status alphabetically both ways", () => {
    const events = [
      makeEvent({ id: "q", event_status: "quoted" }),
      makeEvent({ id: "b", event_status: "booked" }),
      makeEvent({ id: "l", event_status: "lost" }),
    ];
    expect(sortBy(events, { key: "status", direction: "asc" })).toEqual(["b", "l", "q"]);
    expect(sortBy(events, { key: "status", direction: "desc" })).toEqual(["q", "l", "b"]);
  });

  it("sorts account managers by full name, unassigned always last", () => {
    const events = [
      makeEvent({ id: "none" }),
      makeEvent({
        id: "zoe",
        account_manager_first_name: "Zoe",
        account_manager_last_name: "Adams",
      }),
      makeEvent({
        id: "amy",
        account_manager_first_name: "Amy",
        account_manager_last_name: "Young",
      }),
    ];
    expect(sortBy(events, { key: "account_manager", direction: "asc" })).toEqual([
      "amy",
      "zoe",
      "none",
    ]);
    expect(sortBy(events, { key: "account_manager", direction: "desc" })).toEqual([
      "zoe",
      "amy",
      "none",
    ]);
  });

  it("sorts start date chronologically, empty dates last", () => {
    const events = [
      makeEvent({ id: "none" }),
      makeEvent({ id: "jan", event_start: "2026-01-10" }),
      makeEvent({ id: "mar", event_start: "2026-03-10" }),
    ];
    expect(sortBy(events, { key: "start_date", direction: "desc" })).toEqual([
      "mar",
      "jan",
      "none",
    ]);
    expect(sortBy(events, { key: "start_date", direction: "asc" })).toEqual(["jan", "mar", "none"]);
  });

  it("sorts booked date chronologically, unbooked last", () => {
    const events = [
      makeEvent({ id: "unbooked" }),
      makeEvent({ id: "early", booked_at: "2026-02-01T00:00:00Z" }),
      makeEvent({ id: "late", booked_at: "2026-05-01T00:00:00Z" }),
    ];
    expect(sortBy(events, { key: "booked_at", direction: "desc" })).toEqual([
      "late",
      "early",
      "unbooked",
    ]);
    expect(sortBy(events, { key: "booked_at", direction: "asc" })).toEqual([
      "early",
      "late",
      "unbooked",
    ]);
  });

  it("sorts subtotal and tax by amount, numerically not as text", () => {
    const events = [
      makeEvent({ id: "small", contract_revenue_cents: 9_00, tax_amount_cents: 1_00 }),
      makeEvent({ id: "big", contract_revenue_cents: 100_00, tax_amount_cents: 13_00 }),
      makeEvent({ id: "mid", contract_revenue_cents: 20_00, tax_amount_cents: 2_00 }),
    ];
    expect(sortBy(events, { key: "subtotal", direction: "desc" })).toEqual(["big", "mid", "small"]);
    expect(sortBy(events, { key: "subtotal", direction: "asc" })).toEqual(["small", "mid", "big"]);
    expect(sortBy(events, { key: "tax", direction: "desc" })).toEqual(["big", "mid", "small"]);
    expect(sortBy(events, { key: "tax", direction: "asc" })).toEqual(["small", "mid", "big"]);
  });

  it("breaks ties by newest created first", () => {
    const events = [
      makeEvent({ id: "older", event_status: "booked", created_at: "2025-01-01T00:00:00Z" }),
      makeEvent({ id: "newer", event_status: "booked", created_at: "2025-02-01T00:00:00Z" }),
    ];
    expect(sortBy(events, { key: "status", direction: "asc" })).toEqual(["newer", "older"]);
    expect(sortBy(events, { key: "status", direction: "desc" })).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const events = [
      makeEvent({ id: "a", event_name: "B" }),
      makeEvent({ id: "b", event_name: "A" }),
    ];
    sortEvents(events, { key: "event_name", direction: "asc" });
    expect(ids(events)).toEqual(["a", "b"]);
  });
});

describe("nextSort", () => {
  it("starts text columns A→Z and number/date columns biggest/newest first", () => {
    expect(nextSort(DEFAULT_SORT, "event_name")).toEqual({ key: "event_name", direction: "asc" });
    expect(nextSort(DEFAULT_SORT, "subtotal")).toEqual({ key: "subtotal", direction: "desc" });
    expect(nextSort(DEFAULT_SORT, "start_date")).toEqual({ key: "start_date", direction: "desc" });
  });

  it("flips direction when the same column is clicked again", () => {
    expect(nextSort({ key: "event_name", direction: "asc" }, "event_name")).toEqual({
      key: "event_name",
      direction: "desc",
    });
    expect(nextSort({ key: "created_at", direction: "desc" }, "created_at")).toEqual({
      key: "created_at",
      direction: "asc",
    });
  });
});

describe("parseSort / serializeSort", () => {
  it("round-trips a sort through the URL form", () => {
    const sort: EventSort = { key: "tax", direction: "asc" };
    expect(parseSort(serializeSort(sort))).toEqual(sort);
  });

  it("keeps the default sort out of the URL", () => {
    expect(serializeSort(DEFAULT_SORT)).toBeNull();
  });

  it("falls back to the default for missing or unknown values", () => {
    expect(parseSort(null)).toEqual(DEFAULT_SORT);
    expect(parseSort("bogus:asc")).toEqual(DEFAULT_SORT);
    expect(parseSort("tax:sideways")).toEqual(DEFAULT_SORT);
  });
});
