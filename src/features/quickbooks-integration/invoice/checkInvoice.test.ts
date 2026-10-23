import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource, QboInvoiceSnapshot } from "./invoiceTypes";

// docs/specs/qbo-invoice-06-totals-check.md §3 and §10: runInvoiceCheck builds the invoice the quote
// would make today from read-only lookups, compares it with QuickBooks' and stores the answer.
// The lookups and the database are fakes; the builder and the comparison are the real ones.

const { state, calls, createClient } = vi.hoisted(() => {
  const calls: string[] = [];
  const state = {
    item: { id: "item-1", name: "Bleacher Rental - Corporate", description: "Seats" } as unknown,
    itemError: null as Error | null,
    itemArgs: [] as unknown[],
    invoice: null as unknown,
    invoiceError: null as Error | null,
    invoiceArgs: [] as unknown[],
    customerId: "cust-1" as string | null,
    customerArgs: [] as unknown[],
    zoneClass: { classId: "class-1" } as unknown,
    zoneArgs: [] as unknown[],
    provinceCode: null as string | null,
    noTaxCode: null as string | null,
    updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: unknown[] }>,
    updateErrors: [] as Array<{ message: string } | null>,
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
      const ctx = { values: {} as Record<string, unknown>, filters: [] as unknown[] };
      const chain: any = {
        update: (values: Record<string, unknown>) => {
          ctx.values = values;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          ctx.filters.push(["eq", col, val]);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          calls.push("write");
          state.updates.push({ table, values: ctx.values, filters: ctx.filters });
          const error = state.updateErrors.shift() ?? null;
          return Promise.resolve({ error }).then(resolve, reject);
        },
      };
      return chain;
    },
  }));
  return { state, calls, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.mock("./findQboItem", () => ({
  findQboItem: vi.fn(async (...args: unknown[]) => {
    calls.push("item");
    state.itemArgs = args;
    if (state.itemError) throw state.itemError;
    return state.item;
  }),
}));

vi.mock("./qboInvoiceApi", () => ({
  readQboInvoice: vi.fn(async (...args: unknown[]) => {
    calls.push("read-invoice");
    state.invoiceArgs = args;
    if (state.invoiceError) throw state.invoiceError;
    return state.invoice;
  }),
}));

vi.mock("../customers", () => ({
  readLinkedCustomerId: vi.fn(async (...args: unknown[]) => {
    calls.push("customer-link");
    state.customerArgs = args;
    return state.customerId;
  }),
}));

vi.mock("./resolveZoneClass", () => ({
  resolveZoneClass: vi.fn(async (...args: unknown[]) => {
    calls.push("zone-class");
    state.zoneArgs = args;
    return state.zoneClass;
  }),
}));

vi.mock("./resolveProvinceTaxCode", () => ({
  resolveProvinceTaxCode: vi.fn(async () => {
    calls.push("province-code");
    return state.provinceCode;
  }),
  resolveNoTaxCode: vi.fn(async () => {
    calls.push("no-tax-code");
    return state.noTaxCode;
  }),
}));

import { QboReadError, runInvoiceCheck } from "./checkInvoice";
import { NO_TAX_CODE_MISSING } from "./buildInvoicePayload";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const NOW = "2026-10-23T12:00:00.000Z";

/** A quote of $7,500.00 plus $525.00 tax, invoiced in a company its office no longer uses. */
function sourceOf(over: Partial<InvoiceSource> = {}): InvoiceSource {
  return {
    eventId: EVENT_ID,
    eventStatus: "booked",
    deleted: false,
    invoiceNumber: 100200300,
    title: "SC - CLEMSON - RALLY",
    eventTypeName: "Corporate",
    eventStart: "2026-11-01",
    dueDate: "2026-10-15",
    venue: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29631" },
    billedContact: {
      id: "contact-1",
      firstName: "Pat",
      lastName: "Lee",
      email: null,
      companyName: null,
    },
    billToName: "Pat Lee",
    amountCents: 750000,
    taxCents: 52500,
    currency: "USD",
    canadianProvince: null,
    salesOfficeId: "office-1",
    connectionId: "conn-office",
    qboInvoiceId: "inv-1",
    qboInvoiceMismatch: false,
    qboInvoiceMismatchReasons: null,
    ...over,
  };
}

/** The invoice QuickBooks holds when it is exactly the quote's. */
const snapshot = (over: Partial<QboInvoiceSnapshot> = {}): QboInvoiceSnapshot => ({
  docNumber: "100200300",
  txnDate: "2026-11-01",
  dueDate: "2026-10-15",
  customerId: "cust-1",
  billToLine1: "Pat Lee",
  ship: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29631" },
  memo: "SC - CLEMSON - RALLY",
  lines: [
    {
      amountCents: 750000,
      itemId: "item-1",
      description: "Seats",
      taxCodeId: "TAX",
      classId: "class-1",
    },
  ],
  totalCents: 802500,
  taxCents: 52500,
  ...over,
});

const version = (over: Partial<QboInvoiceSnapshot> = {}) => ({
  id: "inv-1",
  syncToken: "3",
  docNumber: "100200300",
  snapshot: snapshot(over),
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  createClient.mockClear();
  calls.length = 0;
  Object.assign(state, {
    item: { id: "item-1", name: "Bleacher Rental - Corporate", description: "Seats" },
    itemError: null,
    itemArgs: [],
    invoice: version(),
    invoiceError: null,
    invoiceArgs: [],
    customerId: "cust-1",
    customerArgs: [],
    zoneClass: { classId: "class-1" },
    zoneArgs: [],
    provinceCode: null,
    noTaxCode: null,
    updates: [],
    updateErrors: [],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const failureOnly = { qbo_invoice_check_failed_at: NOW };

describe("runInvoiceCheck — the order, and where it looks", () => {
  it("looks the Item up, reads the invoice, then looks the other references up, all in order", async () => {
    await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(calls).toEqual(["item", "read-invoice", "customer-link", "zone-class", "write"]);
  });

  it("does everything in the connection of the quote's sales office", async () => {
    await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(state.itemArgs).toEqual(["conn-office", "Corporate"]);
    expect(state.invoiceArgs).toEqual(["conn-office", "inv-1"]);
    expect(state.customerArgs).toEqual(["conn-office", "contact-1"]);
    expect(state.zoneArgs).toEqual(["conn-office", "SC"]);
  });

  it("a Canadian quote also looks up the province's tax code and the no-tax code", async () => {
    state.provinceCode = "5";
    state.invoice = version({
      lines: [{ ...snapshot().lines[0], taxCodeId: "5" }],
    });

    const result = await runInvoiceCheck(
      EVENT_ID,
      sourceOf({
        canadianProvince: "ON",
        venue: { street: "1 Yonge St", city: "Toronto", state: "ON", zip: "M5E" },
      }),
    );

    expect(calls).toContain("province-code");
    expect(calls).toContain("no-tax-code");
    // Street, city, state and zip differ from the fixture's snapshot; the tax code is what matters.
    expect(result).toMatchObject({ status: "checked" });
    expect((result as { reasons: string[] }).reasons).not.toContain("tax_code");
  });

  it("a US quote looks up neither", async () => {
    await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(calls).not.toContain("province-code");
    expect(calls).not.toContain("no-tax-code");
  });

  it("uses the service role", async () => {
    await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("refuses a quote that has no invoice, and looks nothing up", async () => {
    await expect(runInvoiceCheck(EVENT_ID, sourceOf({ qboInvoiceId: null }))).rejects.toThrow(
      /no QuickBooks invoice/,
    );

    expect(calls).toEqual([]);
  });
});

describe("runInvoiceCheck — what it stores after a check", () => {
  it("an invoice equal to the quote: checked, matches, and the flag and time are written", async () => {
    const result = await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({ status: "checked", matches: true, reasons: [], differences: [] });
    expect(state.updates).toEqual([
      {
        table: "Events",
        values: {
          qbo_invoice_mismatch: false,
          qbo_invoice_mismatch_reasons: null,
          qbo_invoice_checked_at: NOW,
          qbo_invoice_check_failed_at: null,
        },
        filters: [["eq", "id", EVENT_ID]],
      },
    ]);
  });

  it("a difference: the flag true and the reasons as a JSON array, in one write", async () => {
    state.invoice = version({ dueDate: "2026-10-20", taxCents: 52501 });

    const result = await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(result).toMatchObject({
      status: "checked",
      matches: false,
      reasons: ["dates", "totals"],
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: JSON.stringify(["dates", "totals"]),
      qbo_invoice_checked_at: NOW,
      qbo_invoice_check_failed_at: null,
    });
  });

  it("a match after a mismatch writes false and no reasons, and clears the failure time", async () => {
    state.invoice = version({ memo: "other" });
    await runInvoiceCheck(EVENT_ID, sourceOf());

    state.invoice = version();
    await runInvoiceCheck(EVENT_ID, sourceOf({ qboInvoiceMismatch: true }));

    expect(state.updates.map((u) => u.values)).toEqual([
      expect.objectContaining({
        qbo_invoice_mismatch: true,
        qbo_invoice_mismatch_reasons: '["memo"]',
      }),
      expect.objectContaining({
        qbo_invoice_mismatch: false,
        qbo_invoice_mismatch_reasons: null,
        qbo_invoice_check_failed_at: null,
      }),
    ]);
  });

  it("a contact with no stored customer link differs in customer", async () => {
    state.customerId = null;

    const result = await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(result).toMatchObject({ matches: false, reasons: ["customer"] });
  });

  it("the check not saving is an ordinary error, not QuickBooks' fault", async () => {
    state.updateErrors = [{ message: "connection refused" }];

    const failure = await runInvoiceCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(QboReadError);
    expect(failure.message).toContain("connection refused");
  });
});

describe("runInvoiceCheck — an invoice QuickBooks no longer has", () => {
  it("returns missing and writes only the failure time", async () => {
    state.invoice = null;

    const result = await runInvoiceCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({ status: "missing" });
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
    expect(state.updates[0].filters).toEqual([["eq", "id", EVENT_ID]]);
  });
});

describe("runInvoiceCheck — a quote that cannot be compared", () => {
  it("a deleted quote is skipped, with the message, before QuickBooks is asked anything", async () => {
    const result = await runInvoiceCheck(EVENT_ID, sourceOf({ deleted: true }));

    expect(result).toMatchObject({
      status: "skipped",
      message: expect.stringContaining("deleted"),
    });
    expect(calls).toEqual(["write"]);
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
  });

  it("an office with no QuickBooks connection is skipped, and QuickBooks is not asked anything", async () => {
    const result = await runInvoiceCheck(EVENT_ID, sourceOf({ connectionId: null }));

    expect(result).toMatchObject({
      status: "skipped",
      message: expect.stringContaining("QuickBooks connection"),
    });
    expect(calls).toEqual(["write"]);
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
  });

  it("every issue is in the message", async () => {
    const result = await runInvoiceCheck(
      EVENT_ID,
      sourceOf({ venue: { street: "", city: "", state: "", zip: "" }, billedContact: null }),
    );

    const message = (result as { message: string }).message;
    expect(message).toContain("contact");
    expect(message).toContain("venue");
  });

  it("a Canadian quote that needs the no-tax code and has none is skipped with that message", async () => {
    state.provinceCode = null;
    state.noTaxCode = null;

    const result = await runInvoiceCheck(
      EVENT_ID,
      sourceOf({ canadianProvince: "ON", taxCents: 0 }),
    );

    expect(result).toEqual({ status: "skipped", message: NO_TAX_CODE_MISSING });
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
  });
});

describe("runInvoiceCheck — a check that fails", () => {
  it("QuickBooks unreachable: a QboReadError with its message, and only the failure time is written", async () => {
    state.invoiceError = new Error("fetch failed");

    const failure = await runInvoiceCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toBe("fetch failed");
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
  });

  it("the Item not found is a QboReadError too", async () => {
    state.itemError = new Error("QuickBooks has no active Item named Bleacher Rental - Corporate");

    const failure = await runInvoiceCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toContain("no active Item");
    expect(calls).not.toContain("read-invoice");
    expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
  });

  it.each([
    ["no total", { totalCents: null }],
    ["a tax that is not an amount", { taxCents: null }],
  ])(
    "an unreadable reply (%s): a QboReadError, only the failure time written",
    async (_label, over) => {
      state.invoice = version(over);

      const failure = await runInvoiceCheck(EVENT_ID, sourceOf()).catch((e) => e);

      expect(failure).toBeInstanceOf(QboReadError);
      expect(state.updates.map((u) => u.values)).toEqual([failureOnly]);
    },
  );

  it("the failure time not saving does not hide what went wrong", async () => {
    state.invoiceError = new Error("fetch failed");
    state.updateErrors = [{ message: "connection refused" }];

    const failure = await runInvoiceCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toBe("fetch failed");
  });

  it("a skipped quote whose failure time cannot be saved is still skipped", async () => {
    state.updateErrors = [{ message: "connection refused" }];

    const result = await runInvoiceCheck(EVENT_ID, sourceOf({ deleted: true }));

    expect(result).toMatchObject({ status: "skipped" });
  });
});
