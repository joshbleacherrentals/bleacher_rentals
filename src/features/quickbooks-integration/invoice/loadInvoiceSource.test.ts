import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, queries, doc } = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  queries: [] as Array<{ table: string; select: string; eq: [string, unknown][] }>,
  doc: { current: null as unknown },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const q = { table, select: "", eq: [] as [string, unknown][] };
      queries.push(q);
      const result = () => ({ data: tables[table] ?? null, error: null });
      const chain: any = {
        select: (s: string) => {
          q.select = s;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          q.eq.push([col, val]);
          return chain;
        },
        maybeSingle: async () => result(),
        single: async () => result(),
      };
      return chain;
    },
  }),
}));

vi.mock("@/features/quotesAndBookings/pdf/quoteDocumentData", () => ({
  buildQuoteDocumentData: vi.fn(async () => doc.current),
}));

import { loadInvoiceSource } from "./loadInvoiceSource";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";

const quoteDoc = (over: Record<string, unknown> = {}) => ({
  eventId: "event-1",
  currency: "USD",
  contact: { name: "Dabo Swinney", email: "d@example.com", phone: "" },
  venue: {
    name: "SC - CLEMSON - RALLY",
    street: "100 Tiger Blvd",
    city: "Clemson",
    state: "SC",
    zip: "29634",
  },
  dates: { eventStart: "2026-11-14", eventEnd: "2026-11-15" },
  subtotalCents: 900000,
  discountsCents: -150000,
  taxAmountCents: 0,
  paymentSchedule: [],
  ...over,
});

beforeEach(() => {
  queries.length = 0;
  doc.current = quoteDoc();
  vi.mocked(buildQuoteDocumentData).mockClear();
  tables.Events = {
    id: "event-1",
    invoice_number: 100200300,
    event_status: "booked",
    event_type_uuid: "type-1",
    event_name: "SC - CLEMSON - RALLY",
    sales_office_uuid: "office-1",
    contact_uuid: "contact-plain",
    finance_contact_uuid: null,
    deleted: false,
    qbo_invoice_id: null,
    qbo_invoice_connection_uuid: null,
    qbo_invoice_hash: "h1",
    qbo_invoice_sent_hash: null,
    qbo_invoice_mismatch: false,
  };
  tables.EventTypes = { name: "Corporate" };
  tables.SalesOffices = { quickbook_uuid: "conn-1" };
  tables.Contacts = {
    id: "contact-plain",
    first_name: "Dabo",
    last_name: "Swinney",
    email: "d@example.com",
    company_uuid: "company-1",
  };
  tables.Companies = { company_name: "Clemson Athletics" };
});

describe("loadInvoiceSource", () => {
  it("builds the source from the quote document and the rows it lacks", async () => {
    const s = await loadInvoiceSource("event-1", "https://app.example.com");
    expect(buildQuoteDocumentData).toHaveBeenCalledWith("event-1", "https://app.example.com");
    expect(s).toEqual({
      eventId: "event-1",
      eventStatus: "booked",
      deleted: false,
      invoiceNumber: 100200300,
      title: "SC - CLEMSON - RALLY",
      eventTypeName: "Corporate",
      eventStart: "2026-11-14",
      dueDate: "2026-11-14",
      venue: { street: "100 Tiger Blvd", city: "Clemson", state: "SC", zip: "29634" },
      billedContact: {
        id: "contact-plain",
        firstName: "Dabo",
        lastName: "Swinney",
        email: "d@example.com",
        companyName: "Clemson Athletics",
      },
      billToName: "Dabo Swinney",
      amountCents: 750000,
      taxCents: 0,
      currency: "USD",
      canadianProvince: null,
      salesOfficeId: "office-1",
      connectionId: "conn-1",
      qboInvoiceId: null,
      qboInvoiceConnectionId: null,
      qboInvoiceHash: "h1",
      qboInvoiceSentHash: null,
      qboInvoiceMismatch: false,
    });
  });

  it("the amount is subtotal plus the (negative) discounts; the tax is the document's tax", async () => {
    doc.current = quoteDoc({ subtotalCents: 100000, discountsCents: -2500, taxAmountCents: 7800 });
    const s = await loadInvoiceSource("event-1", "o");
    expect(s?.amountCents).toBe(97500);
    expect(s?.taxCents).toBe(7800);
  });

  it("the finance contact is the billed contact when set", async () => {
    (tables.Events as any).finance_contact_uuid = "contact-finance";
    tables.Contacts = {
      id: "contact-finance",
      first_name: "Fiona",
      last_name: "Nance",
      email: null,
      company_uuid: null,
    };
    const s = await loadInvoiceSource("event-1", "o");
    expect(s?.billedContact).toEqual({
      id: "contact-finance",
      firstName: "Fiona",
      lastName: "Nance",
      email: null,
      companyName: null,
    });
    const contactQuery = queries.find((q) => q.table === "Contacts")!;
    expect(contactQuery.eq).toContainEqual(["id", "contact-finance"]);
    // No company row is read for a contact without a company.
    expect(queries.some((q) => q.table === "Companies")).toBe(false);
  });

  it("the plain contact is billed when there is no finance contact", async () => {
    await loadInvoiceSource("event-1", "o");
    expect(queries.find((q) => q.table === "Contacts")!.eq).toContainEqual(["id", "contact-plain"]);
  });

  it("the due date is the latest installment", async () => {
    doc.current = quoteDoc({
      paymentSchedule: [
        { dueDate: "2026-10-01" },
        { dueDate: "2026-11-20" },
        { dueDate: "2026-11-02" },
      ],
    });
    expect((await loadInvoiceSource("event-1", "o"))?.dueDate).toBe("2026-11-20");
  });

  it("the due date falls back to the Event Start when the schedule is empty", async () => {
    expect((await loadInvoiceSource("event-1", "o"))?.dueDate).toBe("2026-11-14");
  });

  it.each([
    ["ON", "ON"],
    ["Ontario", "ON"],
    ["Québec", "QC"],
    ["SC", null],
  ])("canadianProvince for state %s is %s", async (state, expected) => {
    doc.current = quoteDoc({
      venue: { name: "x", street: "1 St", city: "c", state, zip: "z" },
    });
    expect((await loadInvoiceSource("event-1", "o"))?.canadianProvince).toBe(expected);
  });

  it("no query joins more than one table", async () => {
    (tables.Events as any).finance_contact_uuid = "contact-finance";
    await loadInvoiceSource("event-1", "o");
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q.select).not.toMatch(/[()]/);
    expect(new Set(queries.map((q) => q.table))).toEqual(
      new Set(["Events", "EventTypes", "SalesOffices", "Contacts", "Companies"]),
    );
  });

  it("a missing event gives null", async () => {
    tables.Events = null;
    expect(await loadInvoiceSource("nope", "o")).toBeNull();
  });

  it("a quote document that cannot be built gives null", async () => {
    doc.current = null;
    expect(await loadInvoiceSource("event-1", "o")).toBeNull();
  });

  it("an event with no type, office or contact still loads, with nulls", async () => {
    Object.assign(tables.Events as object, {
      event_type_uuid: null,
      sales_office_uuid: null,
      contact_uuid: null,
    });
    const s = await loadInvoiceSource("event-1", "o");
    expect(s?.eventTypeName).toBeNull();
    expect(s?.salesOfficeId).toBeNull();
    expect(s?.connectionId).toBeNull();
    expect(s?.billedContact).toBeNull();
  });
});
