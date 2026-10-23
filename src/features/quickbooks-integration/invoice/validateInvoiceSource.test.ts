import { describe, it, expect } from "vitest";
import { validateInvoiceSource } from "./buildInvoicePayload";
import type { InvoiceIssue, InvoiceSource } from "./invoiceTypes";

const source = (over: Partial<InvoiceSource> = {}): InvoiceSource => ({
  eventId: "event-1",
  eventStatus: "booked",
  deleted: false,
  invoiceNumber: 100200300,
  title: "SC - CLEMSON - RALLY",
  eventTypeName: "Corporate",
  eventStart: "2026-11-14",
  dueDate: "2026-11-01",
  venue: { street: "100 Tiger Blvd", city: "Clemson", state: "SC", zip: "29634" },
  billedContact: {
    id: "contact-1",
    firstName: "Dabo",
    lastName: "Swinney",
    email: null,
    companyName: null,
  },
  billToName: "Dabo Swinney",
  amountCents: 750000,
  taxCents: 0,
  currency: "USD",
  canadianProvince: null,
  salesOfficeId: "office-1",
  connectionId: "conn-1",
  qboInvoiceId: null,
  qboInvoiceMismatch: false,
  qboInvoiceMismatchReasons: null,
  ...over,
});

const codes = (issues: InvoiceIssue[]) => issues.map((i) => i.code);

describe("validateInvoiceSource", () => {
  it("a complete source has no issue", () => {
    expect(validateInvoiceSource(source())).toEqual([]);
  });

  it("a Canadian and a US source both pass", () => {
    const canadian = source({
      venue: { street: "1 Yonge St", city: "Toronto", state: "ON", zip: "M5E 1E5" },
      canadianProvince: "ON",
      currency: "CAD",
    });
    expect(validateInvoiceSource(canadian)).toEqual([]);
    expect(validateInvoiceSource(source())).toEqual([]);
  });

  it("deleted", () => {
    expect(codes(validateInvoiceSource(source({ deleted: true })))).toEqual(["deleted"]);
  });

  it("no_invoice_number", () => {
    expect(codes(validateInvoiceSource(source({ invoiceNumber: null })))).toEqual([
      "no_invoice_number",
    ]);
  });

  it("no_event_type", () => {
    expect(codes(validateInvoiceSource(source({ eventTypeName: null })))).toEqual([
      "no_event_type",
    ]);
  });

  it("no_sales_office", () => {
    expect(
      codes(validateInvoiceSource(source({ salesOfficeId: null, connectionId: null }))),
    ).toEqual(["no_sales_office"]);
  });

  it("no_connection", () => {
    expect(codes(validateInvoiceSource(source({ connectionId: null })))).toEqual(["no_connection"]);
  });

  it("no_contact: no billed contact, or one with no name", () => {
    expect(codes(validateInvoiceSource(source({ billedContact: null })))).toEqual(["no_contact"]);
    const nameless = {
      id: "c",
      firstName: "  ",
      lastName: null,
      email: null,
      companyName: null,
    };
    expect(codes(validateInvoiceSource(source({ billedContact: nameless })))).toEqual([
      "no_contact",
    ]);
  });

  it("no_venue: no street, or no state", () => {
    const venue = { street: "100 Tiger Blvd", city: "Clemson", state: "SC", zip: "29634" };
    expect(codes(validateInvoiceSource(source({ venue: { ...venue, street: " " } })))).toEqual([
      "no_venue",
    ]);
    expect(codes(validateInvoiceSource(source({ venue: { ...venue, state: "" } })))).toEqual([
      "no_venue",
    ]);
  });

  it("every message says what to fix", () => {
    const issues = validateInvoiceSource(
      source({
        deleted: true,
        invoiceNumber: null,
        eventTypeName: null,
        salesOfficeId: null,
        connectionId: null,
        billedContact: null,
        venue: { street: "", city: "", state: "", zip: "" },
      }),
    );
    expect(codes(issues)).toEqual([
      "deleted",
      "no_invoice_number",
      "no_event_type",
      "no_sales_office",
      "no_contact",
      "no_venue",
    ]);
    for (const issue of issues) expect(issue.message.length).toBeGreaterThan(10);
  });
});
