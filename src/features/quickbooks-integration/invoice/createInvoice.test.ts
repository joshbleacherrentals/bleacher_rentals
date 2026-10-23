import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource } from "./invoiceTypes";

// docs/specs/qbo-invoice-04-create.md §4 and §11: QuickBooks (a fake fetch), the loader, the other
// QuickBooks helpers and the database are replaced by fakes that record their calls in one list, so
// the order of the steps can be asserted. The builder itself is the real one.
// docs/specs/qbo-invoice-05-update.md §4, case 3: createInvoiceFromSource runs steps 6–13 for a quote
// whose linked invoice QuickBooks no longer has; the create flow itself must not change.

const { calls, state, createClient } = vi.hoisted(() => {
  const calls: string[] = [];
  const state = {
    source: null as unknown,
    loadArgs: [] as unknown[],
    itemError: null as Error | null,
    customer: { kind: "customer", customerId: "cust-1", how: "linked" } as unknown,
    customerError: null as Error | null,
    customerArgs: [] as unknown[],
    zoneClass: { classId: "class-1" } as unknown,
    zoneClassArgs: [] as unknown[],
    taxCode: "tax-ON" as string | null,
    taxCodeArgs: [] as unknown[],
    noTaxCode: "tax-none" as string | null,
    noTaxCodeArgs: [] as unknown[],
    invoicesByNumber: [] as unknown[],
    findQuery: "",
    findResponse: null as { status: number; body: string } | null,
    createResponse: {
      status: 200,
      body: JSON.stringify({ Invoice: { Id: "inv-1", DocNumber: "100200300" } }),
    } as { status: number; body: string },
    createNetworkError: null as Error | null,
    posts: [] as Array<{ url: string; requestId: string | null; body: any }>,
    pdfError: null as Error | null,
    pdfArgs: [] as unknown[],
    check: { status: "checked", matches: true, reasons: [], differences: [] } as unknown,
    checkError: null as Error | null,
    checkArgs: [] as unknown[],
    logCreated: [] as unknown[],
    logIsQbo: [] as unknown[],
    isQbo: false,
    updateRows: [{ id: "evt-1" }] as Array<{ id: string }>,
    linkedId: null as string | null,
    updates: [] as Array<{ values: Record<string, unknown>; filters: unknown[] }>,
    eventWrites: 0,
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
      if (table !== "Events") throw new Error(`unexpected table ${table}`);
      const ctx = {
        op: "select",
        columns: "",
        values: {} as Record<string, unknown>,
        filters: [] as unknown[],
      };
      const chain: any = {
        select: (columns: string) => {
          ctx.columns = columns;
          return chain;
        },
        update: (values: Record<string, unknown>) => {
          ctx.op = "update";
          ctx.values = values;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          ctx.filters.push(["eq", col, val]);
          return chain;
        },
        is: (col: string, val: unknown) => {
          ctx.filters.push(["is", col, val]);
          return chain;
        },
        maybeSingle: async () => {
          if (ctx.columns === "is_qbo") {
            calls.push("read-is-qbo");
            return { data: { is_qbo: state.isQbo }, error: null };
          }
          calls.push("read-link");
          return { data: { qbo_invoice_id: state.linkedId }, error: null };
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          // An awaited update(...).select(...): the rows it changed.
          calls.push("save-link");
          state.eventWrites++;
          state.updates.push({ values: ctx.values, filters: ctx.filters });
          return Promise.resolve({ data: state.updateRows, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  }));
  return { calls, state, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: vi.fn(async () => ({ accessToken: "tok", realmId: "123" })),
}));

vi.mock("./loadInvoiceSource", () => ({
  loadInvoiceSource: vi.fn(async (...args: unknown[]) => {
    calls.push("load");
    state.loadArgs = args;
    return state.source;
  }),
}));

vi.mock("./findQboItem", () => ({
  findQboItem: vi.fn(async (connectionId: string, eventTypeName: string) => {
    calls.push("item");
    if (state.itemError) throw state.itemError;
    return {
      id: "item-1",
      name: `Bleacher Rental - ${eventTypeName}`,
      description: "Seats",
      connectionId,
    };
  }),
}));

vi.mock("../customers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../customers")>()),
  resolveInvoiceCustomer: vi.fn(async (...args: unknown[]) => {
    calls.push("customer");
    state.customerArgs = args;
    if (state.customerError) throw state.customerError;
    return state.customer;
  }),
}));

vi.mock("./resolveZoneClass", () => ({
  resolveZoneClass: vi.fn(async (...args: unknown[]) => {
    calls.push("zone-class");
    state.zoneClassArgs = args;
    return state.zoneClass;
  }),
}));

vi.mock("./resolveProvinceTaxCode", () => ({
  resolveProvinceTaxCode: vi.fn(async (...args: unknown[]) => {
    calls.push("tax-code");
    state.taxCodeArgs = args;
    return state.taxCode;
  }),
  resolveNoTaxCode: vi.fn(async (...args: unknown[]) => {
    calls.push("no-tax-code");
    state.noTaxCodeArgs = args;
    return state.noTaxCode;
  }),
}));

vi.mock("./attachQuotePdf", () => ({
  attachQuotePdf: vi.fn(async (...args: unknown[]) => {
    calls.push("pdf");
    state.pdfArgs = args;
    if (state.pdfError) throw state.pdfError;
  }),
}));

vi.mock("./checkInvoice", () => ({
  runInvoiceCheck: vi.fn(async (...args: unknown[]) => {
    calls.push("check");
    state.checkArgs = args;
    if (state.checkError) throw state.checkError;
    return state.check;
  }),
}));

vi.mock("./logInvoiceChange", () => ({
  logInvoiceChange: vi.fn(async (args: { kind: string }) => {
    calls.push(`log:${args.kind}`);
    state.logCreated.push(args);
  }),
  logIsQboSet: vi.fn(async (args: unknown) => {
    calls.push("log:is_qbo");
    state.logIsQbo.push(args);
  }),
}));

import { createInvoice, createInvoiceFromSource } from "./createInvoice";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

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
      email: "pat@example.com",
      companyName: "Acme",
    },
    billToName: "Pat Lee",
    amountCents: 750000,
    taxCents: 52500,
    currency: "USD",
    canadianProvince: null,
    salesOfficeId: "office-1",
    connectionId: "conn-1",
    qboInvoiceId: null,
    qboInvoiceConnectionId: null,
    qboInvoiceMismatch: false,
    qboInvoiceMismatchReasons: null,
    ...over,
  };
}

const canadian = (over: Partial<InvoiceSource> = {}) =>
  sourceOf({
    venue: { street: "1 King St", city: "Toronto", state: "ON", zip: "M5H 1A1" },
    canadianProvince: "ON",
    currency: "CAD",
    ...over,
  });

const run = (over: { customerChoice?: any } = {}) =>
  createInvoice({
    eventId: EVENT_ID,
    userUuid: "user-1",
    origin: "https://app.example.com",
    ...over,
  });

const json = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  calls.length = 0;
  createClient.mockClear();
  Object.assign(state, {
    source: sourceOf(),
    loadArgs: [],
    itemError: null,
    customer: { kind: "customer", customerId: "cust-1", how: "linked" },
    customerError: null,
    customerArgs: [],
    zoneClass: { classId: "class-1" },
    zoneClassArgs: [],
    taxCode: "tax-ON",
    taxCodeArgs: [],
    noTaxCode: "tax-none",
    noTaxCodeArgs: [],
    invoicesByNumber: [],
    findQuery: "",
    findResponse: null,
    createResponse: json({ Invoice: { Id: "inv-1", DocNumber: "100200300" } }),
    createNetworkError: null,
    posts: [],
    pdfError: null,
    pdfArgs: [],
    check: { status: "checked", matches: true, reasons: [], differences: [] },
    checkError: null,
    checkArgs: [],
    logCreated: [],
    logIsQbo: [],
    isQbo: false,
    updateRows: [{ id: EVENT_ID }],
    linkedId: null,
    updates: [],
    eventWrites: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/query")) {
        calls.push("qbo:find-invoice");
        state.findQuery = u.searchParams.get("query") ?? "";
        const r =
          state.findResponse ?? json({ QueryResponse: { Invoice: state.invoicesByNumber } });
        return new Response(r.body, { status: r.status });
      }
      if (u.pathname.endsWith("/invoice") && init?.method === "POST") {
        calls.push("qbo:create-invoice");
        state.posts.push({
          url,
          requestId: u.searchParams.get("requestid"),
          body: JSON.parse(String(init.body)),
        });
        if (state.createNetworkError) throw state.createNetworkError;
        return new Response(state.createResponse.body, { status: state.createResponse.status });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Nothing reached QuickBooks, the customer link or Events after the quote was loaded. */
function expectNothingWritten() {
  expect(state.posts).toHaveLength(0);
  expect(state.eventWrites).toBe(0);
  expect(calls).not.toContain("qbo:create-invoice");
  expect(calls).not.toContain("save-link");
  expect(calls).not.toContain("log:created");
  expect(calls).not.toContain("pdf");
}

describe("createInvoice — the order of §4", () => {
  it("runs the steps in order for a US quote", async () => {
    const result = await run();

    expect(result.status).toBe("created");
    expect(calls).toEqual([
      "load",
      "item",
      "qbo:find-invoice",
      "customer",
      "zone-class",
      "qbo:create-invoice",
      "read-is-qbo",
      "save-link",
      "log:created",
      "log:is_qbo",
      "check",
      "pdf",
    ]);
  });

  it("looks up the province tax code and the no-tax code, after the Class, for a taxed Canadian quote", async () => {
    state.source = canadian();

    await run();

    expect(calls.slice(0, 8)).toEqual([
      "load",
      "item",
      "qbo:find-invoice",
      "customer",
      "zone-class",
      "tax-code",
      "no-tax-code",
      "qbo:create-invoice",
    ]);
    expect(state.taxCodeArgs).toEqual(["conn-1", "ON"]);
    expect(state.noTaxCodeArgs).toEqual(["conn-1"]);
  });

  it("does not look up a province tax code for a US quote or an untaxed Canadian one", async () => {
    await run();
    expect(calls).not.toContain("tax-code");

    calls.length = 0;
    state.source = canadian({ taxCents: 0 });
    await run();
    expect(calls).not.toContain("tax-code");
  });

  it("reads the no-tax code for a Canadian quote, taxed or not, and never for a US quote", async () => {
    await run();
    expect(calls).not.toContain("no-tax-code");

    calls.length = 0;
    state.source = canadian({ taxCents: 0 });
    await run();
    expect(calls).toContain("no-tax-code");
    expect(state.noTaxCodeArgs).toEqual(["conn-1"]);
  });

  it("hands the loader the event and the origin", async () => {
    await run();

    expect(state.loadArgs).toEqual([EVENT_ID, "https://app.example.com"]);
  });

  it("asks for the Class by the venue's state and the customer for the billed contact", async () => {
    state.source = sourceOf();

    await run({ customerChoice: { kind: "new" } });

    expect(state.zoneClassArgs).toEqual(["conn-1", "SC"]);
    expect(state.customerArgs).toEqual([
      "conn-1",
      expect.objectContaining({ id: "contact-1", firstName: "Pat" }),
      { kind: "new" },
    ]);
  });
});

describe("createInvoice — a quote that cannot be invoiced", () => {
  it("answers 404 when there is no such event", async () => {
    state.source = null;

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 404 });
    expect(calls).toEqual(["load"]);
  });

  it("answers 409 when the quote already has an invoice", async () => {
    state.source = sourceOf({ qboInvoiceId: "inv-old" });

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect(calls).toEqual(["load"]);
    expectNothingWritten();
  });

  it.each(["draft", "quoted", "unsigned_changes", "lost", null])(
    "answers 400 with the status when the status is %s, not booked",
    async (status) => {
      state.source = sourceOf({ eventStatus: status });

      const result = await run();

      expect(result).toMatchObject({ status: "error", httpStatus: 400 });
      expect((result as { error: string }).error).toContain("booked");
      if (status) expect((result as { error: string }).error).toContain(status);
      expect(calls).toEqual(["load"]);
      expectNothingWritten();
    },
  );

  it.each([
    ["deleted", { deleted: true }, /deleted/],
    ["no invoice number", { invoiceNumber: null }, /no invoice number/],
    ["no event type", { eventTypeName: null }, /event type/],
    ["no sales office", { salesOfficeId: null, connectionId: null }, /sales office/],
    ["no connection", { connectionId: null }, /QuickBooks connection/],
    ["no contact", { billedContact: null }, /contact/],
    ["no venue", { venue: { street: "", city: "", state: "", zip: "" } }, /venue/],
  ] as Array<[string, Partial<InvoiceSource>, RegExp]>)(
    "answers 400 with the issue's message for %s, and writes nothing",
    async (_label, over, message) => {
      state.source = sourceOf(over);

      const result = await run();

      expect(result).toMatchObject({ status: "error", httpStatus: 400 });
      expect((result as { error: string }).error).toMatch(message);
      expect(calls).toEqual(["load"]);
      expectNothingWritten();
    },
  );

  it("joins the messages when there are several issues", async () => {
    state.source = sourceOf({ invoiceNumber: null, eventTypeName: null });

    const result = await run();

    const text = (result as { error: string }).error;
    expect(text).toMatch(/no invoice number/);
    expect(text).toMatch(/event type/);
  });
});

describe("createInvoice — a failing step ends the request", () => {
  it("the Item missing in QuickBooks: 400 with its message, nothing after it", async () => {
    state.itemError = new Error(
      'QuickBooks has no active Item named "Bleacher Rental - Corporate" in this company',
    );

    const result = await run();

    expect(result).toEqual({
      status: "error",
      httpStatus: 400,
      error: 'QuickBooks has no active Item named "Bleacher Rental - Corporate" in this company',
    });
    expect(calls).toEqual(["load", "item"]);
    expectNothingWritten();
  });

  it("the invoice search failing: 502, nothing after it", async () => {
    state.findResponse = json({ Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } }, 500);

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect((result as { error: string }).error).toContain("boom");
    expect(calls).toEqual(["load", "item", "qbo:find-invoice"]);
    expectNothingWritten();
  });

  it("the customer step failing: 400 with its message, nothing after it", async () => {
    state.customerError = new Error("QuickBooks already has a customer, vendor or employee named");

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect((result as { error: string }).error).toContain("already has a customer");
    expect(calls).toEqual(["load", "item", "qbo:find-invoice", "customer"]);
    expectNothingWritten();
  });

  it.each([
    ["the Item step", "itemError", ["load", "item"]],
    ["the customer step", "customerError", ["load", "item", "qbo:find-invoice", "customer"]],
  ])(
    "an expired or revoked QuickBooks token in %s is passed on, readable, with 502",
    async (_label, key, expectedCalls) => {
      (state as any)[key] = new Error(
        'QuickBooks connection needs to be re-authenticated (invalid_grant). Go to /quickbooks and click "Re-authenticate" for this connection.',
      );

      const result = await run();

      expect(result).toMatchObject({ status: "error", httpStatus: 502 });
      expect((result as { error: string }).error).toContain("re-authenticated");
      expect(calls).toEqual(expectedCalls);
    },
  );

  it("a refresh token that has expired is passed on with 502", async () => {
    state.itemError = new Error(
      "QuickBooks refresh token has expired. Please re-authenticate the connection.",
    );

    expect(await run()).toMatchObject({ status: "error", httpStatus: 502 });
  });

  it("a connection with no tokens is passed on with 502", async () => {
    state.itemError = new Error("No tokens found for this QBO connection");

    expect(await run()).toMatchObject({ status: "error", httpStatus: 502 });
  });

  it("an unexpected failure (the database) is not swallowed", async () => {
    const { resolveZoneClass } = await import("./resolveZoneClass");
    vi.mocked(resolveZoneClass).mockRejectedValueOnce(new Error("Failed to read the zone states"));

    await expect(run()).rejects.toThrow(/zone states/);
    expectNothingWritten();
  });
});

describe("createInvoice — an invoice with this number is already in QuickBooks", () => {
  beforeEach(() => {
    state.invoicesByNumber = [
      {
        Id: "inv-77",
        DocNumber: "100200300",
        CustomerRef: { value: "9", name: "Pat Lee" },
        TotalAmt: 8062.5,
      },
    ];
  });

  it("returns it and stops: nothing is written to QuickBooks or to Events", async () => {
    const result = await run();

    expect(result).toEqual({
      status: "invoice_number_exists",
      invoice: { id: "inv-77", number: "100200300", customerName: "Pat Lee", totalCents: 806250 },
    });
    expect(calls).toEqual(["load", "item", "qbo:find-invoice"]);
    expectNothingWritten();
  });

  it("asks QuickBooks for the invoice number of the quote", async () => {
    await run();

    expect(state.findQuery).toContain("from Invoice");
    expect(state.findQuery).toContain("DocNumber = '100200300'");
  });

  it("turns a total with float noise into exact cents", async () => {
    state.invoicesByNumber = [
      {
        Id: "inv-77",
        DocNumber: "100200300",
        CustomerRef: { value: "9", name: "Pat" },
        TotalAmt: 1234.56,
      },
    ];

    const result = await run();

    expect((result as { invoice: { totalCents: number } }).invoice.totalCents).toBe(123456);
  });

  it("does not ask for a customer first (the customer is not created for an invoice that exists)", async () => {
    await run();

    expect(calls).not.toContain("customer");
  });
});

describe("createInvoice — the accountant has to choose a customer", () => {
  it("returns the candidates and stops: nothing is written to QuickBooks or to Events", async () => {
    const candidates = [
      { id: "1", displayName: "Pat Lee", companyName: "Acme", email: "pat@example.com" },
      { id: "2", displayName: "Pat Lee", companyName: null, email: null },
    ];
    state.customer = { kind: "choose", candidates };

    const result = await run();

    expect(result).toEqual({ status: "choose_customer", candidates });
    expect(calls).toEqual(["load", "item", "qbo:find-invoice", "customer"]);
    expectNothingWritten();
  });
});

describe("createInvoice — the QuickBooks invoice", () => {
  it("sends the builder's body with the resolved customer, Item and Class", async () => {
    state.customer = { kind: "customer", customerId: "cust-42", how: "created" };

    await run();

    expect(state.posts).toHaveLength(1);
    const { body } = state.posts[0];
    expect(body).toMatchObject({
      DocNumber: "100200300",
      TxnDate: "2026-11-01",
      DueDate: "2026-10-15",
      CustomerRef: { value: "cust-42" },
      PrivateNote: "SC - CLEMSON - RALLY",
    });
    expect(body.Line).toHaveLength(1);
    expect(body.Line[0]).toMatchObject({
      Amount: "7500.00",
      SalesItemLineDetail: {
        ItemRef: { value: "item-1" },
        Qty: 1,
        TaxCodeRef: { value: "TAX" },
        ClassRef: { value: "class-1" },
      },
    });
    expect(body.BillEmail).toBeUndefined();
  });

  it("creates it in the quote's connection, with the user's token", async () => {
    await run();

    expect(state.posts[0].url).toContain("https://qbo.example.com/v3/company/123/invoice");
  });

  it("returns created with the QuickBooks id, the number and the totals check", async () => {
    expect(await run()).toEqual({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      warnings: [],
      check: { matches: true, reasons: [], differences: [] },
    });
  });

  it("a quote with no Class is created without one, with the class_missing warning", async () => {
    state.zoneClass = {
      classId: null,
      warning: { code: "class_missing", state: "SC", reason: "no_zone" },
    };

    const result = await run();

    expect(result).toMatchObject({
      status: "created",
      warnings: [{ code: "class_missing", state: "SC", reason: "no_zone" }],
    });
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.ClassRef).toBeUndefined();
  });

  it("a taxed Canadian quote with no mapped code is created untaxed, with tax_code_missing", async () => {
    state.source = canadian();
    state.taxCode = null;

    const result = await run();

    expect(result).toMatchObject({
      status: "created",
      warnings: [{ code: "tax_code_missing", province: "ON" }],
    });
    const { body } = state.posts[0];
    expect(body.TxnTaxDetail).toBeUndefined();
    // QuickBooks Canada refuses NON: the line carries the connection's no-tax code instead.
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-none" });
  });

  it("a taxed Canadian quote with a mapped code carries it on the line, and no warning", async () => {
    state.source = canadian();

    const result = await run();

    expect((result as { warnings: unknown[] }).warnings).toEqual([]);
    const { body } = state.posts[0];
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-ON" });
    expect(body.TxnTaxDetail).toBeUndefined();
  });

  it("an untaxed Canadian quote carries the no-tax code on the line, and no warning", async () => {
    state.source = canadian({ taxCents: 0 });

    const result = await run();

    expect((result as { warnings: unknown[] }).warnings).toEqual([]);
    const { body } = state.posts[0];
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-none" });
    expect(body.TxnTaxDetail).toBeUndefined();
  });

  it("a US quote still carries TAX or NON on the line", async () => {
    await run();
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "TAX" });

    state.posts = [];
    state.source = sourceOf({ taxCents: 0 });
    await run();
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "NON" });
  });

  describe("a Canadian quote that needs the no-tax code while the connection has none", () => {
    const MESSAGE =
      "This QuickBooks connection has no 'no tax' code for Canadian invoices. Ask an admin to choose one on the QuickBooks page.";

    beforeEach(() => {
      state.noTaxCode = null;
    });

    it.each([
      ["untaxed", { taxCents: 0 }, "tax-ON"],
      ["taxed, with no province code", {}, null],
    ] as Array<[string, Partial<InvoiceSource>, string | null]>)(
      "is refused with 400 and the message when it is %s",
      async (_label, over, provinceCode) => {
        state.source = canadian(over);
        state.taxCode = provinceCode;

        const result = await run();

        expect(result).toEqual({ status: "error", httpStatus: 400, error: MESSAGE });
        expect(calls).toContain("no-tax-code");
        expectNothingWritten();
      },
    );

    it("is not stopped when the province code is mapped, which it does not need it for", async () => {
      state.source = canadian();

      const result = await run();

      expect(result.status).toBe("created");
      expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({
        value: "tax-ON",
      });
    });

    it("does not stop a US quote", async () => {
      expect((await run()).status).toBe("created");
    });
  });

  it("both warnings can come together, the Class first", async () => {
    state.source = canadian();
    state.taxCode = null;
    state.zoneClass = {
      classId: null,
      warning: { code: "class_missing", state: "ON", reason: "no_class" },
    };

    const result = await run();

    expect((result as { warnings: unknown[] }).warnings).toEqual([
      { code: "class_missing", state: "ON", reason: "no_class" },
      { code: "tax_code_missing", province: "ON" },
    ]);
    const { body } = state.posts[0];
    expect(body.Line[0].SalesItemLineDetail.ClassRef).toBeUndefined();
    expect(body.TxnTaxDetail).toBeUndefined();
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-none" });
  });
});

describe("createInvoice — QuickBooks refuses the invoice", () => {
  it("answers 502 with the interpreted fault and writes nothing to Events", async () => {
    state.createResponse = json(
      {
        Fault: {
          Error: [
            {
              Message: "A business validation error has occurred",
              Detail: "QuickBooks encountered an error while calculating tax.",
              code: "6000",
            },
          ],
        },
      },
      400,
    );

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect((result as { error: string }).error).toContain("could not calculate the tax");
    expect(calls).toEqual([
      "load",
      "item",
      "qbo:find-invoice",
      "customer",
      "zone-class",
      "qbo:create-invoice",
    ]);
    expect(state.eventWrites).toBe(0);
  });

  it("answers 502 with QuickBooks' own text for a fault it does not know", async () => {
    state.createResponse = json(
      { Fault: { Error: [{ Message: "Duplicate", Detail: "Duplicate Document Number Error" }] } },
      400,
    );

    const result = await run();

    expect(result).toEqual({
      status: "error",
      httpStatus: 502,
      error: "Duplicate Document Number Error",
    });
  });

  it("answers 502 with the platform's text for an error page without JSON", async () => {
    state.createResponse = { status: 504, body: "An error occurred with your deployment" };

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect((result as { error: string }).error).toContain("504");
    expect(state.eventWrites).toBe(0);
  });

  it("answers 502 when QuickBooks cannot be reached", async () => {
    state.createNetworkError = new Error("fetch failed");

    const result = await run();

    expect(result).toEqual({ status: "error", httpStatus: 502, error: "fetch failed" });
    expect(state.eventWrites).toBe(0);
  });

  it("answers 502 when QuickBooks answers 200 without an invoice", async () => {
    state.createResponse = json({});

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect(state.eventWrites).toBe(0);
  });
});

describe("createInvoice — the idempotency key", () => {
  const requestIdOf = async (over: Partial<InvoiceSource> = {}, event = EVENT_ID) => {
    state.posts = [];
    state.source = sourceOf({ eventId: event, ...over });
    await createInvoice({
      eventId: event,
      userUuid: "user-1",
      origin: "https://app.example.com",
    });
    return state.posts[0].requestId;
  };

  it("is the same for the same event", async () => {
    const first = await requestIdOf();
    const second = await requestIdOf();

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("is the same whatever the quote's data: no hash of it is involved", async () => {
    const first = await requestIdOf({ amountCents: 750000, title: "SC - CLEMSON - RALLY" });
    const second = await requestIdOf({ amountCents: 810000, title: "SC - CLEMSON - TAILGATE" });

    expect(second).toBe(first);
  });

  it("differs for another event", async () => {
    const first = await requestIdOf();
    const second = await requestIdOf({}, "11111111-2222-4333-8444-555555555555");

    expect(second).not.toBe(first);
  });

  it("fits QuickBooks' 50 characters", async () => {
    expect((await requestIdOf())!.length).toBeLessThanOrEqual(50);
  });
});

describe("createInvoice — saving the link", () => {
  it("saves the id, the connection, no mismatch, no reasons, no check times and is_qbo in one guarded update", async () => {
    await run();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({
      qbo_invoice_id: "inv-1",
      qbo_invoice_connection_uuid: "conn-1",
      qbo_invoice_mismatch: false,
      qbo_invoice_mismatch_reasons: null,
      qbo_invoice_checked_at: null,
      qbo_invoice_check_failed_at: null,
      is_qbo: true,
    });
    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["is", "qbo_invoice_id", null],
    ]);
  });

  it("uses the service role", async () => {
    await run();

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("saves the link before the PDF", async () => {
    await run();

    expect(calls.indexOf("save-link")).toBeLessThan(calls.indexOf("pdf"));
  });

  it("another request linked the same invoice first: carries on", async () => {
    state.updateRows = [];
    state.linkedId = "inv-1";

    const result = await run();

    expect(result.status).toBe("created");
    expect(calls).toContain("log:created");
    expect(calls).toContain("pdf");
  });

  it("another request linked a different invoice first: 409 with the message, nothing after it", async () => {
    state.updateRows = [];
    state.linkedId = "inv-other";

    const result = await run();

    expect(result).toEqual({
      status: "error",
      httpStatus: 409,
      error:
        "Another invoice was linked to this quote while this one was being made. The extra invoice 100200300 is in QuickBooks; delete it there.",
    });
    expect(calls).not.toContain("log:created");
    expect(calls).not.toContain("pdf");
  });

  it("no row changed and none is linked: an error, not a silent success", async () => {
    state.updateRows = [];
    state.linkedId = null;

    await expect(run()).rejects.toThrow(/link/i);
    expect(calls).not.toContain("pdf");
  });
});

describe("createInvoice — the Log", () => {
  it("writes the invoice row and the is_qbo row, by the user who pressed the button", async () => {
    await run();

    expect(state.logCreated).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "created", docNumber: "100200300" },
    ]);
    expect(state.logIsQbo).toEqual([{ eventId: EVENT_ID, userUuid: "user-1" }]);
  });

  it("an is_qbo that was already true gets no second row", async () => {
    state.isQbo = true;

    await run();

    expect(state.logCreated).toHaveLength(1);
    expect(state.logIsQbo).toHaveLength(0);
    expect(state.updates[0].values.is_qbo).toBe(true);
  });

  it("reads is_qbo before the link is saved", async () => {
    await run();

    expect(calls.indexOf("read-is-qbo")).toBeLessThan(calls.indexOf("save-link"));
  });
});

describe("createInvoice — the PDF", () => {
  it("attaches the quote's PDF to the new invoice", async () => {
    await run();

    expect(state.pdfArgs).toEqual(["conn-1", "inv-1", EVENT_ID]);
  });

  it("a PDF failure still returns created, with the pdf_not_attached warning and its reason", async () => {
    state.pdfError = new Error("render blew up");

    const result = await run();

    expect(result).toEqual({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      warnings: [{ code: "pdf_not_attached", reason: "render blew up" }],
      check: { matches: true, reasons: [], differences: [] },
    });
    expect(calls).toContain("save-link");
    expect(calls).toContain("log:created");
  });

  it("the PDF warning comes after the others", async () => {
    state.pdfError = new Error("render blew up");
    state.zoneClass = {
      classId: null,
      warning: { code: "class_missing", state: "SC", reason: "no_class" },
    };

    const result = await run();

    expect((result as { warnings: Array<{ code: string }> }).warnings.map((w) => w.code)).toEqual([
      "class_missing",
      "pdf_not_attached",
    ]);
  });
});

describe("createInvoice — the invoice check (spec 06)", () => {
  const ITEM = { id: "item-1", name: "Bleacher Rental - Corporate", description: "Seats" };

  it("runs after the link and the Log, before the PDF", async () => {
    await run();

    expect(calls.indexOf("save-link")).toBeLessThan(calls.indexOf("check"));
    expect(calls.indexOf("log:created")).toBeLessThan(calls.indexOf("check"));
    expect(calls.indexOf("log:is_qbo")).toBeLessThan(calls.indexOf("check"));
    expect(calls.indexOf("check")).toBeLessThan(calls.indexOf("pdf"));
  });

  it("checks the new invoice, in the connection it was made in, against the quote", async () => {
    await run();

    expect(state.checkArgs).toEqual([
      EVENT_ID,
      expect.objectContaining({
        eventId: EVENT_ID,
        qboInvoiceId: "inv-1",
        qboInvoiceConnectionId: "conn-1",
        amountCents: 750000,
        taxCents: 52500,
      }),
    ]);
  });

  it("puts the comparison in the response as check", async () => {
    state.check = { status: "checked", matches: true, reasons: [], differences: [] };

    expect(await run()).toMatchObject({
      status: "created",
      check: { matches: true, reasons: [], differences: [] },
    });
  });

  it("a mismatch is a result, not a failure: created, with the differences and no warning", async () => {
    const differences = [{ reason: "totals", field: "Tax", quote: "$525.00", qbo: "$525.01" }];
    state.check = { status: "checked", matches: false, reasons: ["totals"], differences };

    const result = await run();

    expect(result).toEqual({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      warnings: [],
      check: { matches: false, reasons: ["totals"], differences },
    });
  });

  it("a check that fails still returns created, with invoice_check_failed and its reason, and no check", async () => {
    state.checkError = new Error("QuickBooks invoice read failed: fetch failed");

    const result = await run();

    expect(result).toEqual({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      warnings: [
        { code: "invoice_check_failed", reason: "QuickBooks invoice read failed: fetch failed" },
      ],
    });
    expect(result).not.toHaveProperty("check");
  });

  it("a failed check leaves the link, the Log and the PDF as they are", async () => {
    state.checkError = new Error("boom");

    await run();

    expect(calls).toContain("save-link");
    expect(calls).toContain("log:created");
    expect(calls).toContain("pdf");
    expect(state.updates).toHaveLength(1);
  });

  it("an invoice QuickBooks cannot find is the same warning, and no check", async () => {
    state.check = { status: "missing" };

    const result = await run();

    expect(result).toMatchObject({
      status: "created",
      warnings: [{ code: "invoice_check_failed", reason: expect.stringContaining("QuickBooks") }],
    });
    expect(result).not.toHaveProperty("check");
  });

  it("a quote the check could not compare is the same warning, with its message, and no check", async () => {
    state.check = { status: "skipped", message: "Add the venue's street address and state." };

    const result = await run();

    expect(result).toMatchObject({
      status: "created",
      warnings: [
        { code: "invoice_check_failed", reason: "Add the venue's street address and state." },
      ],
    });
    expect(result).not.toHaveProperty("check");
  });

  it("the warning comes after the others and before the PDF's", async () => {
    state.checkError = new Error("boom");
    state.pdfError = new Error("render blew up");
    state.zoneClass = {
      classId: null,
      warning: { code: "class_missing", state: "SC", reason: "no_class" },
    };

    const result = await run();

    expect((result as { warnings: Array<{ code: string }> }).warnings.map((w) => w.code)).toEqual([
      "class_missing",
      "invoice_check_failed",
      "pdf_not_attached",
    ]);
  });

  it("does not run when QuickBooks refused the invoice", async () => {
    state.createResponse = json({ Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } }, 400);

    await run();

    expect(calls).not.toContain("check");
  });

  it("does not run when another invoice was linked first", async () => {
    state.updateRows = [];
    state.linkedId = "inv-other";

    await run();

    expect(calls).not.toContain("check");
  });

  it("case 3 runs it too, on the new invoice and not the one it replaces", async () => {
    const result = await createInvoiceFromSource({
      source: sourceOf({ qboInvoiceId: "inv-old", qboInvoiceConnectionId: "conn-1" }),
      item: ITEM,
      userUuid: "user-1",
      replacingInvoiceId: "inv-old",
    });

    expect(result).toMatchObject({ status: "created", check: { matches: true } });
    expect(calls.indexOf("log:recreated")).toBeLessThan(calls.indexOf("check"));
    expect(calls.indexOf("check")).toBeLessThan(calls.indexOf("pdf"));
    expect(state.checkArgs[1]).toMatchObject({
      qboInvoiceId: "inv-1",
      qboInvoiceConnectionId: "conn-1",
    });
  });
});

describe("createInvoiceFromSource — case 3 of spec 05, creating again after 'not found'", () => {
  const OLD_ID = "inv-old";
  const ITEM = { id: "item-1", name: "Bleacher Rental - Corporate", description: "Seats" };

  const again = (over: Partial<Parameters<typeof createInvoiceFromSource>[0]> = {}) =>
    createInvoiceFromSource({
      source: sourceOf({ qboInvoiceId: OLD_ID, qboInvoiceConnectionId: "conn-1" }),
      item: ITEM,
      userUuid: "user-1",
      replacingInvoiceId: OLD_ID,
      ...over,
    });

  it("runs steps 6–13 and does not look the Item up again", async () => {
    const result = await again();

    expect(result.status).toBe("created");
    expect(calls).toEqual([
      "qbo:find-invoice",
      "customer",
      "zone-class",
      "qbo:create-invoice",
      "read-is-qbo",
      "save-link",
      "log:recreated",
      "log:is_qbo",
      "check",
      "pdf",
    ]);
  });

  it("replaces only the old invoice's link: the update is guarded by the old id, not by IS NULL", async () => {
    await again();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["eq", "qbo_invoice_id", OLD_ID],
    ]);
    expect(state.updates[0].values).toEqual({
      qbo_invoice_id: "inv-1",
      qbo_invoice_connection_uuid: "conn-1",
      qbo_invoice_mismatch: false,
      qbo_invoice_mismatch_reasons: null,
      qbo_invoice_checked_at: null,
      qbo_invoice_check_failed_at: null,
      is_qbo: true,
    });
  });

  it("writes the Log as 'recreated' and the is_qbo row when the box was unticked", async () => {
    await again();

    expect(state.logCreated).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "recreated", docNumber: "100200300" },
    ]);
    expect(state.logIsQbo).toHaveLength(1);
  });

  it("an is_qbo that was already true gets no second Log row", async () => {
    state.isQbo = true;

    await again();

    expect(state.logIsQbo).toHaveLength(0);
  });

  it("does not apply the booked rule (the caller decided; a lost quote is created again)", async () => {
    const result = await again({
      source: sourceOf({
        eventStatus: "lost",
        qboInvoiceId: OLD_ID,
        qboInvoiceConnectionId: "conn-1",
      }),
    });

    expect(result.status).toBe("created");
  });

  it("carries another request id than the create of the same event", async () => {
    await createInvoice({
      eventId: EVENT_ID,
      userUuid: "user-1",
      origin: "https://app.example.com",
    });
    const created = state.posts.at(-1)!.requestId;
    await again();
    const recreated = state.posts.at(-1)!.requestId;

    expect(recreated).toBeTruthy();
    expect(recreated).not.toBe(created);
    expect(recreated!.length).toBeLessThanOrEqual(50);
  });

  it("the same old invoice and event give the same request id (a double press)", async () => {
    await again();
    const first = state.posts.at(-1)!.requestId;
    await again();

    expect(state.posts.at(-1)!.requestId).toBe(first);
  });

  it("still stops at an invoice with this number: nothing is written", async () => {
    state.invoicesByNumber = [
      {
        Id: "inv-77",
        DocNumber: "100200300",
        CustomerRef: { value: "9", name: "Pat" },
        TotalAmt: 1,
      },
    ];

    const result = await again();

    expect(result.status).toBe("invoice_number_exists");
    expectNothingWritten();
  });

  it("still returns choose_customer: nothing is written", async () => {
    state.customer = { kind: "choose", candidates: [] };

    expect((await again()).status).toBe("choose_customer");
    expectNothingWritten();
  });

  it("another request already replaced the link with this invoice: carries on", async () => {
    state.updateRows = [];
    state.linkedId = "inv-1";

    expect((await again()).status).toBe("created");
  });

  it("the link is now another invoice: 409 with the extra invoice named, nothing after it", async () => {
    state.updateRows = [];
    state.linkedId = "inv-other";

    const result = await again();

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect((result as { error: string }).error).toContain("100200300");
    expect(calls).not.toContain("pdf");
  });

  it("a Canadian quote that needs the no-tax code and has none is refused with 400", async () => {
    state.noTaxCode = null;

    const result = await again({
      source: canadian({ taxCents: 0, qboInvoiceId: OLD_ID, qboInvoiceConnectionId: "conn-1" }),
    });

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect((result as { error: string }).error).toContain("no tax");
    expectNothingWritten();
  });

  it("a plain create is unchanged: guarded by IS NULL, logged as created", async () => {
    await run();

    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["is", "qbo_invoice_id", null],
    ]);
    expect(calls).toContain("log:created");
    expect(calls).not.toContain("log:recreated");
  });
});
