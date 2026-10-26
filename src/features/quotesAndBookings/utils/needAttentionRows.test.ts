import { describe, expect, it } from "vitest";
import type { QuotesBookingsEvent } from "../types";
import { needAttentionRows, type NeedAttentionRow } from "./needAttentionRows";

// Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §3 and §8.

const event = (id: string, over: Partial<QuotesBookingsEvent> = {}): QuotesBookingsEvent => ({
  id,
  event_name: `Event ${id}`,
  event_start: "2026-09-20",
  event_end: null,
  event_status: "booked",
  contract_revenue_cents: null,
  tax_amount_cents: null,
  tax_percent: null,
  created_at: "2026-08-01T00:00:00Z",
  booked_at: null,
  quote_sent_at: null,
  created_by_user_uuid: null,
  goodshuffle_url: null,
  is_qbo: null,
  sales_office_uuid: null,
  deleted: 0,
  invoice_number: 1042,
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
  ...over,
});

const flagged = (id: string, over: Partial<NeedAttentionRow> = {}): NeedAttentionRow => ({
  id,
  qbo_invoice_id: `inv-${id}`,
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: '["dates"]',
  ...over,
});

describe("needAttentionRows", () => {
  it("returns an event that has an invoice and a set flag, with its reasons", () => {
    const rows = needAttentionRows([event("a")], [flagged("a")]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a", event_name: "Event a", reasons: ["dates"] });
  });

  it("gives several reasons in spec 06's order, whatever order they were stored in", () => {
    const rows = needAttentionRows(
      [event("a")],
      [flagged("a", { qbo_invoice_mismatch_reasons: '["totals","dates"]' })],
    );

    expect(rows[0].reasons).toEqual(["dates", "totals"]);
  });

  it("gives unspecified where the flag is set and no usable reason is stored", () => {
    for (const reasons of [null, "", "[]", "not json", '["nonsense"]']) {
      const rows = needAttentionRows(
        [event("a")],
        [flagged("a", { qbo_invoice_mismatch_reasons: reasons })],
      );

      expect(rows[0].reasons, String(reasons)).toEqual(["unspecified"]);
    }
  });

  it("returns none for a flag that is not set, whatever reasons are stored", () => {
    for (const flag of [0, null]) {
      expect(
        needAttentionRows([event("a")], [flagged("a", { qbo_invoice_mismatch: flag })]),
      ).toEqual([]);
    }
  });

  it("returns none for an event with no invoice, even with a set flag", () => {
    expect(needAttentionRows([event("a")], [flagged("a", { qbo_invoice_id: null })])).toEqual([]);
  });

  it("returns none for an event that has no row of attention data", () => {
    expect(needAttentionRows([event("a")], [])).toEqual([]);
  });

  it("does not return an event that is not in the page's events", () => {
    // Filtered out by the Filter Panel, or deleted while Show Deleted is off.
    const rows = needAttentionRows([event("a")], [flagged("a"), flagged("gone")]);

    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("keeps the order of the page's events, not the order of the attention rows", () => {
    const rows = needAttentionRows(
      [event("c"), event("a"), event("b"), event("quiet")],
      [flagged("a"), flagged("b"), flagged("c")],
    );

    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("returns one result per event, even if an event has two attention rows", () => {
    const rows = needAttentionRows(
      [event("a")],
      [flagged("a"), flagged("a", { qbo_invoice_mismatch_reasons: '["totals"]' })],
    );

    expect(rows).toHaveLength(1);
  });

  it("returns the event's own fields untouched, so the table can search and sort it", () => {
    const original = event("a", { event_name: "Fall Classic", invoice_number: 77 });
    const [row] = needAttentionRows([original], [flagged("a")]);

    expect(row).toMatchObject({ ...original, reasons: ["dates"] });
  });
});
