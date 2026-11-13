import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "../types";
import type { AccountsReceivableEvent } from "../types";
import { INVOICE_REASON_TEXT } from "./invoiceAttention";
import type { NeedAttentionEvent } from "./needAttentionRows";
import {
  CSV_HEADERS,
  NEED_ATTENTION_CSV_HEADERS,
  RECEIVABLES_CSV_HEADERS,
  buildEventsCsv,
  buildNeedAttentionCsv,
  buildReceivablesCsv,
  eventStatusLabel,
} from "./eventsCsv";

const BOM = "﻿";

function event(overrides: Partial<QuotesBookingsEvent> = {}): QuotesBookingsEvent {
  return {
    id: "e1",
    event_name: "Homecoming",
    event_start: "2026-10-03T00:00:00.000",
    event_end: null,
    event_status: "booked",
    contract_revenue_cents: 107500,
    tax_amount_cents: 7500,
    tax_percent: null,
    created_at: "2026-09-01T12:00:00.000",
    booked_at: "2026-09-15T12:00:00.000",
    quote_sent_at: null,
    created_by_user_uuid: null,
    goodshuffle_url: null,
    is_qbo: null,
    sales_office_uuid: null,
    deleted: 0,
    invoice_number: null,
    account_manager_first_name: "Ada",
    account_manager_last_name: "Lovelace",
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

const usd = () => "USD" as const;

/** The rows below the header, split on the CSV's own line break. */
function rows(csv: string): string[] {
  return csv.replace(BOM, "").split("\r\n");
}

describe("eventStatusLabel", () => {
  it("capitalizes the status", () => {
    expect(eventStatusLabel(event({ event_status: "quoted" }))).toBe("Quoted");
  });

  it("says Deleted for a deleted event, whatever its status was", () => {
    expect(eventStatusLabel(event({ event_status: "booked", deleted: 1 }))).toBe("Deleted");
  });

  it("says Unknown when there is no status", () => {
    expect(eventStatusLabel(event({ event_status: null }))).toBe("Unknown");
  });
});

describe("buildEventsCsv", () => {
  it("starts with a byte-order mark so Excel reads accents as UTF-8", () => {
    expect(buildEventsCsv([], usd).startsWith(BOM)).toBe(true);
  });

  it("uses the list's columns, without the counts and totals the screen adds to a header", () => {
    expect(CSV_HEADERS).toEqual([
      "Event Name",
      "Status",
      "Account Manager",
      "Start Date",
      "Booked",
      "Created At",
      "Subtotal",
      "Tax",
    ]);
    expect(rows(buildEventsCsv([], usd))[0]).toBe(CSV_HEADERS.join(","));
  });

  it("writes one row per event, in the order given", () => {
    const csv = buildEventsCsv(
      [event({ id: "a", event_name: "First" }), event({ id: "b", event_name: "Second" })],
      usd,
    );
    const lines = rows(csv);
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith("First,")).toBe(true);
    expect(lines[2].startsWith("Second,")).toBe(true);
  });

  it("writes each cell as the list shows it", () => {
    const [, line] = rows(buildEventsCsv([event()], usd));
    // The money has a thousands separator, so the cells are quoted.
    expect(line).toBe(
      'Homecoming,Booked,Ada Lovelace,"Oct 3, 2026","Sep 15, 2026","Sep 1, 2026","$1,000.00",$75.00',
    );
  });

  it("splits the stored total into subtotal and tax like the list does", () => {
    const [, line] = rows(
      buildEventsCsv([event({ contract_revenue_cents: 107500, tax_amount_cents: 7500 })], usd),
    );
    expect(line).toContain('"$1,000.00"');
    expect(line).toContain("$75.00");
  });

  it("marks a Canadian office's amounts with C$, per event", () => {
    const csv = buildEventsCsv(
      [event({ id: "ca", sales_office_uuid: "office-ca", tax_amount_cents: 7500 })],
      (e) => (e.sales_office_uuid === "office-ca" ? "CAD" : "USD"),
    );
    expect(rows(csv)[1]).toContain('"C$1,000.00",C$75.00');
  });

  it("leaves a missing date empty", () => {
    const [, line] = rows(
      buildEventsCsv([event({ event_start: null, booked_at: null, created_at: null })], usd),
    );
    expect(line).toBe('Homecoming,Booked,Ada Lovelace,,,,"$1,000.00",$75.00');
  });

  it("says Not Assigned when there is no account manager", () => {
    const [, line] = rows(
      buildEventsCsv(
        [event({ account_manager_first_name: null, account_manager_last_name: null })],
        usd,
      ),
    );
    expect(line).toContain(",Not Assigned,");
  });

  it("exports a deleted event as Deleted", () => {
    const [, line] = rows(buildEventsCsv([event({ deleted: 1 })], usd));
    expect(line).toContain("Homecoming,Deleted,");
  });

  it("keeps an event name with a comma and a quote in one cell", () => {
    const [, line] = rows(buildEventsCsv([event({ event_name: 'Smith, "Jr" Bash' })], usd));
    expect(line.startsWith('"Smith, ""Jr"" Bash",Booked,')).toBe(true);
  });

  it("keeps a name with a line break in one record", () => {
    const csv = buildEventsCsv([event({ event_name: "Two\nLines" })], usd);
    expect(csv).toContain('"Two\nLines",Booked');
  });

  it("defuses a name that a spreadsheet would run as a formula", () => {
    for (const name of ['=HYPERLINK("http://x")', "+1+1", "-2+3", "@SUM(A1)"]) {
      const [, line] = rows(buildEventsCsv([event({ event_name: name })], usd));
      // A leading apostrophe makes the spreadsheet read the cell as text.
      expect(line.replace(/^"/, "").startsWith(`'${name[0]}`)).toBe(true);
    }
  });

  it("does not touch a negative amount, which is a number and not a formula", () => {
    const [, line] = rows(
      buildEventsCsv([event({ contract_revenue_cents: -10000, tax_amount_cents: 0 })], usd),
    );
    expect(line).toContain(",-$100.00,");
  });

  it("writes only the header for an empty list", () => {
    expect(rows(buildEventsCsv([], usd))).toEqual([CSV_HEADERS.join(",")]);
  });
});

function receivable(overrides: Partial<AccountsReceivableEvent> = {}): AccountsReceivableEvent {
  return {
    ...event(),
    invoice_number: 42,
    amount_due_cents: 250000,
    remaining_balance_cents: 1234567,
    ...overrides,
  };
}

describe("buildReceivablesCsv", () => {
  it("uses the AR Deposits columns, without the count and totals the screen adds to a header", () => {
    expect(RECEIVABLES_CSV_HEADERS).toEqual([
      "Event Name",
      "Account Manager",
      "Start Date",
      "Invoice #",
      "Amount Due",
      "Remaining Balance",
    ]);
    expect(rows(buildReceivablesCsv([], usd))).toEqual([RECEIVABLES_CSV_HEADERS.join(",")]);
  });

  it("writes each cell as the tab shows it, the invoice number padded and marked with #", () => {
    const [, line] = rows(buildReceivablesCsv([receivable()], usd));
    expect(line).toBe('Homecoming,Ada Lovelace,"Oct 3, 2026",#000000042,"$2,500.00","$12,345.67"');
  });

  it("leaves the invoice number empty when the event has none", () => {
    const [, line] = rows(buildReceivablesCsv([receivable({ invoice_number: null })], usd));
    expect(line).toContain('"Oct 3, 2026",,"$2,500.00"');
  });

  it("marks a Canadian office's amounts with C$, per event", () => {
    const [, line] = rows(
      buildReceivablesCsv([receivable({ sales_office_uuid: "office-ca" })], (e) =>
        e.sales_office_uuid === "office-ca" ? "CAD" : "USD",
      ),
    );
    expect(line).toContain('"C$2,500.00","C$12,345.67"');
  });

  it("keeps the order it is given and defuses a name that would run as a formula", () => {
    const lines = rows(
      buildReceivablesCsv(
        [receivable({ event_name: "=1+1" }), receivable({ event_name: "Second" })],
        usd,
      ),
    );
    expect(lines[1].startsWith("'=1+1,")).toBe(true);
    expect(lines[2].startsWith("Second,")).toBe(true);
  });
});

function needsAttention(overrides: Partial<NeedAttentionEvent> = {}): NeedAttentionEvent {
  return { ...event(), invoice_number: 42, reasons: ["number"], ...overrides };
}

describe("buildNeedAttentionCsv", () => {
  it("uses the Need attention columns", () => {
    expect(NEED_ATTENTION_CSV_HEADERS).toEqual([
      "Event Name",
      "Account Manager",
      "Start Date",
      "Invoice #",
      "Reason",
    ]);
    expect(rows(buildNeedAttentionCsv([]))[0]).toBe(NEED_ATTENTION_CSV_HEADERS.join(","));
  });

  it("writes the reason the way the tab words it", () => {
    const [, line] = rows(buildNeedAttentionCsv([needsAttention({ reasons: ["number"] })]));
    expect(line).toBe(
      `Homecoming,Ada Lovelace,"Oct 3, 2026",#000000042,${INVOICE_REASON_TEXT.number.short}`,
    );
  });

  it("puts every reason of an event in the one cell, as the tab does", () => {
    const [, line] = rows(
      buildNeedAttentionCsv([needsAttention({ reasons: ["number", "dates"] })]),
    );
    const both = `${INVOICE_REASON_TEXT.number.short}, ${INVOICE_REASON_TEXT.dates.short}`;
    expect(line.endsWith(`,"${both}"`)).toBe(true);
  });
});
