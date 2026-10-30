import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuotesBookingsEvent } from "../types";
import { EventNameCell } from "./eventListCells";

// Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §4 (EventNameCell's `attention`) and §8.

const event: QuotesBookingsEvent = {
  id: "evt-1",
  event_name: "Fall Classic",
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
  account_manager_first_name: "Dana",
  account_manager_last_name: "Whitfield",
  account_manager_email: null,
  address_street: null,
  address_city: null,
  address_state: null,
  contact_first_name: null,
  contact_last_name: null,
  contact_email: null,
  company_name: null,
};

describe("EventNameCell", () => {
  it("is unchanged without `attention`: the same markup for no prop, undefined and no reasons", () => {
    const without = renderToStaticMarkup(<EventNameCell event={event} />);

    expect(renderToStaticMarkup(<EventNameCell event={event} attention={undefined} />)).toBe(
      without,
    );
    expect(renderToStaticMarkup(<EventNameCell event={event} attention={[]} />)).toBe(without);
    expect(without).not.toContain("invoice-attention-mark");
    expect(without).toContain('title="Fall Classic"');
  });

  it("draws the mark before the name when the event has reasons", () => {
    const html = renderToStaticMarkup(<EventNameCell event={event} attention={["dates"]} />);

    expect(html).toContain('data-testid="invoice-attention-mark"');
    expect(html).toContain('title="Dates do not match"');
    expect(html.indexOf("invoice-attention-mark")).toBeLessThan(
      html.indexOf('title="Fall Classic"'),
    );
  });

  it("still draws the name and the GoodShuffle badge beside the mark", () => {
    const inGoodShuffle = { ...event, goodshuffle_url: "https://app.goodshuffle.com/x" };

    const html = renderToStaticMarkup(
      <EventNameCell event={inGoodShuffle} attention={["totals"]} />,
    );

    expect(html).toContain("invoice-attention-mark");
    expect(html).toContain("Fall Classic");
    expect(html).toContain("GoodShuffle");
  });
});
