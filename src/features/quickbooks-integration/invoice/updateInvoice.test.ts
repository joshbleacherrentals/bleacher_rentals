import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource } from "./invoiceTypes";

// docs/specs/qbo-invoice-05-update.md §4 and §10: QuickBooks (a fake fetch), the loader, the other
// QuickBooks helpers and the database are replaced by fakes that record their calls in one list, so
// the order of the steps can be asserted. The builder and the QuickBooks invoice API are the real ones.

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
    taxCode: "tax-ON" as string | null,
    taxCodeArgs: [] as unknown[],
    noTaxCode: "tax-none" as string | null,
    invoicesById: {} as Record<string, unknown>,
    reads: [] as string[],
    readUrls: [] as string[],
    readResponse: null as { status: number; body: string } | null,
    readNetworkError: null as Error | null,
    invoicesByNumber: [] as unknown[],
    updateResponse: null as { status: number; body: string } | null,
    updateNetworkError: null as Error | null,
    createResponse: {
      status: 200,
      body: JSON.stringify({ Invoice: { Id: "inv-new", DocNumber: "100200300" } }),
    } as { status: number; body: string },
    posts: [] as Array<{ kind: string; url: string; requestId: string | null; body: any }>,
    pdfError: null as Error | null,
    pdfArgs: [] as unknown[],
    replaceError: null as Error | null,
    replaceArgs: [] as unknown[],
    logs: [] as unknown[],
    logIsQbo: [] as unknown[],
    isQbo: false,
    updateRows: [{ id: "evt-1" }] as Array<{ id: string }>,
    linkedId: null as string | null,
    updates: [] as Array<{ values: Record<string, unknown>; filters: unknown[] }>,
    eventWrites: 0,
    connections: [] as Array<{ id: string; display_name: string }>,
    connectionsError: null as { message: string } | null,
    linkReadError: null as { message: string } | null,
  };
  const createClient = vi.fn(() => ({
    from: (table: string) => {
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
        in: (col: string, vals: unknown[]) => {
          ctx.filters.push(["in", col, vals]);
          return chain;
        },
        maybeSingle: async () => {
          if (table !== "Events") throw new Error(`unexpected maybeSingle on ${table}`);
          if (ctx.columns === "is_qbo") {
            calls.push("read-is-qbo");
            return { data: { is_qbo: state.isQbo }, error: null };
          }
          calls.push("read-link");
          if (state.linkReadError) return { data: null, error: state.linkReadError };
          return { data: { qbo_invoice_id: state.linkedId }, error: null };
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (table === "QboConnections") {
            calls.push("connections");
            const ids = ((ctx.filters[0] as unknown[])?.[2] as string[]) ?? [];
            const result = state.connectionsError
              ? { data: null, error: state.connectionsError }
              : { data: state.connections.filter((c) => ids.includes(c.id)), error: null };
            return Promise.resolve(result).then(resolve, reject);
          }
          if (table !== "Events") throw new Error(`unexpected table ${table}`);
          // An awaited update(...): the rows it changed.
          calls.push(ctx.values.qbo_invoice_id !== undefined ? "save-link" : "save-sent-hash");
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
  resolveZoneClass: vi.fn(async () => {
    calls.push("zone-class");
    return state.zoneClass;
  }),
}));

vi.mock("./resolveProvinceTaxCode", () => ({
  resolveProvinceTaxCode: vi.fn(async (...args: unknown[]) => {
    calls.push("tax-code");
    state.taxCodeArgs = args;
    return state.taxCode;
  }),
  resolveNoTaxCode: vi.fn(async () => {
    calls.push("no-tax-code");
    return state.noTaxCode;
  }),
}));

vi.mock("./attachQuotePdf", () => ({
  attachQuotePdf: vi.fn(async (...args: unknown[]) => {
    calls.push("pdf");
    state.pdfArgs = args;
    if (state.pdfError) throw state.pdfError;
  }),
  replaceQuotePdf: vi.fn(async (...args: unknown[]) => {
    calls.push("pdf-replace");
    state.replaceArgs = args;
    if (state.replaceError) throw state.replaceError;
  }),
}));

vi.mock("./logInvoiceChange", () => ({
  logInvoiceChange: vi.fn(async (args: { kind: string }) => {
    calls.push(`log:${args.kind}`);
    state.logs.push(args);
  }),
  logIsQboSet: vi.fn(async (args: unknown) => {
    calls.push("log:is_qbo");
    state.logIsQbo.push(args);
  }),
}));

import { overwriteInvoice, readLinkedInvoiceId, updateInvoice } from "./updateInvoice";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

/** A quote that already has an invoice in the same company as its office. */
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
    qboInvoiceId: "inv-1",
    qboInvoiceConnectionId: "conn-1",
    qboInvoiceHash: "hash-A",
    qboInvoiceSentHash: "hash-old",
    qboInvoiceMismatch: false,
    ...over,
  };
}

/** The same quote with no invoice yet (case 2, overwriting by number). */
const unlinked = (over: Partial<InvoiceSource> = {}) =>
  sourceOf({
    qboInvoiceId: null,
    qboInvoiceConnectionId: null,
    qboInvoiceSentHash: null,
    ...over,
  });

const canadian = (over: Partial<InvoiceSource> = {}) =>
  sourceOf({
    venue: { street: "1 King St", city: "Toronto", state: "ON", zip: "M5H 1A1" },
    canadianProvince: "ON",
    currency: "CAD",
    ...over,
  });

const run = (over: { customerChoice?: any; replaceMissing?: boolean } = {}) =>
  updateInvoice({
    eventId: EVENT_ID,
    userUuid: "user-1",
    origin: "https://app.example.com",
    ...over,
  });

const overwrite = (
  over: { overwriteInvoiceId?: string; customerChoice?: any; replaceMissing?: boolean } = {},
) =>
  overwriteInvoice({
    eventId: EVENT_ID,
    overwriteInvoiceId: "inv-77",
    userUuid: "user-1",
    origin: "https://app.example.com",
    ...over,
  });

const json = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

const NOT_FOUND = json(
  {
    Fault: {
      Error: [
        {
          Message: "Object Not Found",
          Detail: "Object Not Found : Something you're trying to use has been made inactive.",
          code: "610",
        },
      ],
      type: "ValidationFault",
    },
  },
  400,
);

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
    taxCode: "tax-ON",
    taxCodeArgs: [],
    noTaxCode: "tax-none",
    invoicesById: {
      "inv-1": { Id: "inv-1", SyncToken: "7", DocNumber: "100200300" },
      "inv-77": { Id: "inv-77", SyncToken: "3", DocNumber: "100200300" },
    },
    reads: [],
    readUrls: [],
    readResponse: null,
    readNetworkError: null,
    invoicesByNumber: [],
    updateResponse: null,
    updateNetworkError: null,
    createResponse: json({ Invoice: { Id: "inv-new", DocNumber: "100200300" } }),
    posts: [],
    pdfError: null,
    pdfArgs: [],
    replaceError: null,
    replaceArgs: [],
    logs: [],
    logIsQbo: [],
    isQbo: false,
    updateRows: [{ id: EVENT_ID }],
    linkedId: null,
    updates: [],
    eventWrites: 0,
    connections: [],
    connectionsError: null,
    linkReadError: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const read = u.pathname.match(/\/invoice\/([^/]+)$/);
      if (read && (!init?.method || init.method === "GET")) {
        calls.push("qbo:read-invoice");
        const id = decodeURIComponent(read[1]);
        state.reads.push(id);
        state.readUrls.push(url);
        if (state.readNetworkError) throw state.readNetworkError;
        if (state.readResponse)
          return new Response(state.readResponse.body, { status: state.readResponse.status });
        const found = state.invoicesById[id];
        if (!found) return new Response(NOT_FOUND.body, { status: NOT_FOUND.status });
        return new Response(JSON.stringify({ Invoice: found }), { status: 200 });
      }
      if (u.pathname.endsWith("/query")) {
        calls.push("qbo:find-invoice");
        return new Response(
          JSON.stringify({ QueryResponse: { Invoice: state.invoicesByNumber } }),
          {
            status: 200,
          },
        );
      }
      if (u.pathname.endsWith("/invoice") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const kind = body.Id ? "update" : "create";
        calls.push(`qbo:${kind}-invoice`);
        state.posts.push({ kind, url, requestId: u.searchParams.get("requestid"), body });
        if (kind === "update") {
          if (state.updateNetworkError) throw state.updateNetworkError;
          const r =
            state.updateResponse ??
            json({ Invoice: { Id: body.Id, DocNumber: body.DocNumber, SyncToken: "8" } });
          return new Response(r.body, { status: r.status });
        }
        return new Response(state.createResponse.body, { status: state.createResponse.status });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Nothing reached QuickBooks, Events, the Log or the PDF after the quote was loaded. */
function expectNothingWritten() {
  expect(state.posts).toHaveLength(0);
  expect(state.eventWrites).toBe(0);
  expect(state.logs).toHaveLength(0);
  expect(calls).not.toContain("qbo:update-invoice");
  expect(calls).not.toContain("qbo:create-invoice");
  expect(calls).not.toContain("save-sent-hash");
  expect(calls).not.toContain("save-link");
  expect(calls).not.toContain("pdf");
  expect(calls).not.toContain("pdf-replace");
}

const errorOf = (result: unknown) => (result as { error: string }).error;

describe("updateInvoice — case 1, the order of §4", () => {
  it("runs the steps in order for a US quote and answers updated", async () => {
    const result = await run();

    expect(result).toEqual({
      status: "updated",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      linkedExisting: false,
      warnings: [],
    });
    expect(calls).toEqual([
      "load",
      "item",
      "qbo:read-invoice",
      "customer",
      "zone-class",
      "qbo:update-invoice",
      "save-sent-hash",
      "log:updated",
      "pdf-replace",
    ]);
  });

  it("looks up the province tax code and the no-tax code, after the Class, for a Canadian quote", async () => {
    state.source = canadian();

    await run();

    expect(calls.slice(0, 8)).toEqual([
      "load",
      "item",
      "qbo:read-invoice",
      "customer",
      "zone-class",
      "tax-code",
      "no-tax-code",
      "qbo:update-invoice",
    ]);
    expect(state.taxCodeArgs).toEqual(["conn-1", "ON"]);
  });

  it("hands the loader the event and the origin", async () => {
    await run();

    expect(state.loadArgs).toEqual([EVENT_ID, "https://app.example.com"]);
  });

  it("does not apply the booked rule: any status still updates", async () => {
    for (const status of ["draft", "quoted", "unsigned_changes", "lost", null]) {
      calls.length = 0;
      state.source = sourceOf({ eventStatus: status });

      expect((await run()).status).toBe("updated");
    }
  });

  it("reads the invoice by the stored id, in the quote's connection", async () => {
    await run();

    expect(state.reads).toEqual(["inv-1"]);
    expect(state.readUrls[0]).toContain("https://qbo.example.com/v3/company/123/invoice/inv-1");
  });

  it("hands the customer step the billed contact and the choice", async () => {
    await run({ customerChoice: { kind: "new" } });

    expect(state.customerArgs).toEqual([
      "conn-1",
      expect.objectContaining({ id: "contact-1", firstName: "Pat" }),
      { kind: "new" },
    ]);
  });
});

describe("updateInvoice — the sparse update", () => {
  it("carries the invoice's Id and the SyncToken just read, flagged sparse", async () => {
    await run();

    expect(state.posts).toHaveLength(1);
    const { body } = state.posts[0];
    expect(body.Id).toBe("inv-1");
    expect(body.SyncToken).toBe("7");
    expect(body.sparse).toBe(true);
  });

  it("carries every field the app sets, with the one line replacing the list", async () => {
    state.customer = { kind: "customer", customerId: "cust-42", how: "created" };

    await run();

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
  });

  it("goes to the quote's connection's company, with no request id (the SyncToken guards it)", async () => {
    await run();

    expect(state.posts[0].url).toContain("https://qbo.example.com/v3/company/123/invoice");
    expect(state.posts[0].requestId).toBeNull();
  });

  it("a Canadian quote carries the province's tax code on the line; an untaxed one the no-tax code", async () => {
    state.source = canadian();
    await run();
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-ON" });

    state.posts = [];
    state.source = canadian({ taxCents: 0 });
    await run();
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({
      value: "tax-none",
    });
  });

  it("answers with the number QuickBooks returned", async () => {
    state.updateResponse = json({
      Invoice: { Id: "inv-1", DocNumber: "100200301", SyncToken: "8" },
    });

    expect(await run()).toMatchObject({ status: "updated", docNumber: "100200301" });
    expect(state.logs).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "updated", docNumber: "100200301" },
    ]);
  });
});

describe("updateInvoice — what is saved", () => {
  it("saves only the sent hash, the one the quote had when it was loaded", async () => {
    state.source = sourceOf({ qboInvoiceHash: "hash-before-the-data" });

    await run();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({ qbo_invoice_sent_hash: "hash-before-the-data" });
    expect(state.updates[0].filters).toEqual([["eq", "id", EVENT_ID]]);
  });

  it("uses the service role", async () => {
    await run();

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("does not touch is_qbo, even when the box was unticked by hand", async () => {
    state.isQbo = false;

    await run();

    expect(calls).not.toContain("read-is-qbo");
    expect(state.updates[0].values).not.toHaveProperty("is_qbo");
    expect(state.logIsQbo).toHaveLength(0);
  });

  it("saves after QuickBooks accepted the update, before the Log and the PDF", async () => {
    await run();

    expect(calls.indexOf("qbo:update-invoice")).toBeLessThan(calls.indexOf("save-sent-hash"));
    expect(calls.indexOf("save-sent-hash")).toBeLessThan(calls.indexOf("log:updated"));
    expect(calls.indexOf("log:updated")).toBeLessThan(calls.indexOf("pdf-replace"));
  });
});

describe("updateInvoice — the Log and the PDF", () => {
  it("writes the Log as 'updated', by the user who pressed the button", async () => {
    await run();

    expect(state.logs).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "updated", docNumber: "100200300" },
    ]);
  });

  it("replaces the PDF of the stored invoice, in the stored connection", async () => {
    await run();

    expect(state.replaceArgs).toEqual(["conn-1", "inv-1", EVENT_ID]);
    expect(calls).not.toContain("pdf");
  });

  it("a PDF failure still returns updated, with the pdf_not_attached warning and its reason", async () => {
    state.replaceError = new Error("render blew up");

    expect(await run()).toEqual({
      status: "updated",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      linkedExisting: false,
      warnings: [{ code: "pdf_not_attached", reason: "render blew up" }],
    });
    expect(calls).toContain("save-sent-hash");
    expect(calls).toContain("log:updated");
  });

  it("the PDF warning comes after the others", async () => {
    state.replaceError = new Error("render blew up");
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

describe("updateInvoice — warnings", () => {
  it("a quote with no Class is updated without one, with class_missing", async () => {
    state.zoneClass = {
      classId: null,
      warning: { code: "class_missing", state: "SC", reason: "no_zone" },
    };

    const result = await run();

    expect(result).toMatchObject({
      status: "updated",
      warnings: [{ code: "class_missing", state: "SC", reason: "no_zone" }],
    });
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.ClassRef).toBeUndefined();
  });

  it("a taxed Canadian quote with no mapped code is updated untaxed, with tax_code_missing", async () => {
    state.source = canadian();
    state.taxCode = null;

    const result = await run();

    expect(result).toMatchObject({
      status: "updated",
      warnings: [{ code: "tax_code_missing", province: "ON" }],
    });
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({
      value: "tax-none",
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
  });
});

describe("updateInvoice — the Canadian no-tax code", () => {
  const MESSAGE =
    "This QuickBooks connection has no 'no tax' code for Canadian invoices. Ask an admin to choose one on the QuickBooks page.";

  beforeEach(() => {
    state.noTaxCode = null;
  });

  it.each([
    ["untaxed", { taxCents: 0 }, "tax-ON"],
    ["taxed, with no province code", {}, null],
  ] as Array<[string, Partial<InvoiceSource>, string | null]>)(
    "is refused with 400 and the message when it is %s, and nothing is written",
    async (_label, over, provinceCode) => {
      state.source = canadian(over);
      state.taxCode = provinceCode;

      const result = await run();

      expect(result).toEqual({ status: "error", httpStatus: 400, error: MESSAGE });
      expectNothingWritten();
    },
  );

  it("is not stopped when the province code is mapped, which it does not need it for", async () => {
    state.source = canadian();

    expect((await run()).status).toBe("updated");
    expect(state.posts[0].body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "tax-ON" });
  });

  it("does not stop a US quote", async () => {
    expect((await run()).status).toBe("updated");
  });
});

describe("updateInvoice — the company moved (step 1)", () => {
  const MESSAGE =
    "This invoice is in the BR USA QuickBooks company, but this quote's office now uses BR Canada. Nothing was changed. Fix it by hand in QuickBooks.";

  beforeEach(() => {
    state.source = sourceOf({ qboInvoiceConnectionId: "conn-old" });
    state.connections = [
      { id: "conn-old", display_name: "BR USA" },
      { id: "conn-1", display_name: "BR Canada" },
    ];
  });

  it("answers 409 naming both companies, and writes nothing", async () => {
    const result = await run();

    expect(result).toEqual({ status: "error", httpStatus: 409, error: MESSAGE });
    expect(calls).toEqual(["load", "connections"]);
    expectNothingWritten();
  });

  it("reads the two names with one query", async () => {
    await run();

    expect(calls.filter((c) => c === "connections")).toHaveLength(1);
  });

  it("is checked before the validation and the booked rule", async () => {
    state.source = sourceOf({
      qboInvoiceConnectionId: "conn-old",
      eventStatus: "lost",
      invoiceNumber: null,
    });

    expect(errorOf(await run())).toBe(MESSAGE);
  });

  it("falls back to a plain word for a company it cannot name", async () => {
    state.connections = [{ id: "conn-1", display_name: "BR Canada" }];

    expect(errorOf(await run())).toContain("in the unknown QuickBooks company");
  });

  it("an unreadable connection table is not swallowed", async () => {
    state.connectionsError = { message: "boom" };

    await expect(run()).rejects.toThrow(/boom/);
    expectNothingWritten();
  });

  it("is not raised when the office has no connection: the validation says so instead", async () => {
    state.source = sourceOf({ qboInvoiceConnectionId: "conn-old", connectionId: null });

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(errorOf(result)).toMatch(/QuickBooks connection/);
    expect(calls).toEqual(["load"]);
  });
});

describe("updateInvoice — a quote that cannot be updated", () => {
  it("answers 404 when there is no such event", async () => {
    state.source = null;

    expect(await run()).toMatchObject({ status: "error", httpStatus: 404 });
    expect(calls).toEqual(["load"]);
  });

  it("answers 409 when the quote has no invoice to update", async () => {
    state.source = unlinked();

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect(errorOf(result)).toContain("no QuickBooks invoice");
    expect(calls).toEqual(["load"]);
    expectNothingWritten();
  });

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
      expect(errorOf(result)).toMatch(message);
      expect(calls).not.toContain("item");
      expectNothingWritten();
    },
  );
});

describe("updateInvoice — a failing step ends the request", () => {
  it("the Item missing in QuickBooks: 400 with its message, nothing after it", async () => {
    state.itemError = new Error(
      'QuickBooks has no active Item named "Bleacher Rental - Corporate"',
    );

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(calls).toEqual(["load", "item"]);
    expectNothingWritten();
  });

  it("the customer step failing: 400 with its message, nothing after it", async () => {
    state.customerError = new Error("QuickBooks already has a customer, vendor or employee named");

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(calls).toEqual(["load", "item", "qbo:read-invoice", "customer"]);
    expectNothingWritten();
  });

  it("a lost QuickBooks token in the Item or the customer step is passed on with 502", async () => {
    state.itemError = new Error(
      'QuickBooks connection needs to be re-authenticated (invalid_grant). Go to /quickbooks and click "Re-authenticate" for this connection.',
    );
    expect(await run()).toMatchObject({ status: "error", httpStatus: 502 });

    state.itemError = null;
    state.customerError = new Error("No tokens found for this QBO connection");
    expect(await run()).toMatchObject({ status: "error", httpStatus: 502 });
  });

  it("the customer step asking for a choice returns the candidates and writes nothing", async () => {
    const candidates = [
      { id: "1", displayName: "Pat Lee", companyName: "Acme", email: "pat@example.com" },
      { id: "2", displayName: "Pat Lee", companyName: null, email: null },
    ];
    state.customer = { kind: "choose", candidates };

    expect(await run()).toEqual({ status: "choose_customer", candidates });
    expect(calls).toEqual(["load", "item", "qbo:read-invoice", "customer"]);
    expectNothingWritten();
  });

  it("an unexpected failure (the database) is not swallowed", async () => {
    const { resolveZoneClass } = await import("./resolveZoneClass");
    vi.mocked(resolveZoneClass).mockRejectedValueOnce(new Error("Failed to read the zone states"));

    await expect(run()).rejects.toThrow(/zone states/);
    expectNothingWritten();
  });
});

describe("updateInvoice — reading the invoice (step 5)", () => {
  it("an invoice QuickBooks no longer has: invoice_missing, and nothing is written", async () => {
    delete state.invoicesById["inv-1"];

    expect(await run()).toEqual({ status: "invoice_missing" });
    expect(calls).toEqual(["load", "item", "qbo:read-invoice"]);
    expectNothingWritten();
  });

  it("recognises the fault by its text when the code is not the expected one", async () => {
    state.readResponse = json(
      { Fault: { Error: [{ Message: "Object Not Found", Detail: "Nothing here", code: "500" }] } },
      400,
    );

    expect(await run()).toEqual({ status: "invoice_missing" });
  });

  it("any other fault is a 502 with QuickBooks' text, not 'missing'", async () => {
    state.readResponse = json(
      { Fault: { Error: [{ Message: "Bad", Detail: "Authentication failed", code: "3200" }] } },
      401,
    );

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect(errorOf(result)).toContain("Authentication failed");
    expectNothingWritten();
  });

  it("a platform error page is a 502, not 'missing'", async () => {
    state.readResponse = { status: 504, body: "An error occurred with your deployment" };

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect(errorOf(result)).toContain("504");
    expectNothingWritten();
  });

  it("QuickBooks being unreachable is a 502", async () => {
    state.readNetworkError = new Error("fetch failed");

    expect(await run()).toMatchObject({ status: "error", httpStatus: 502, error: "fetch failed" });
    expectNothingWritten();
  });
});

describe("updateInvoice — QuickBooks refuses the update", () => {
  it("answers 502 with the interpreted fault and writes nothing to Events, the Log or the PDF", async () => {
    state.updateResponse = json(
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
    expect(errorOf(result)).toContain("could not calculate the tax");
    expect(calls).toEqual([
      "load",
      "item",
      "qbo:read-invoice",
      "customer",
      "zone-class",
      "qbo:update-invoice",
    ]);
    expect(state.eventWrites).toBe(0);
    expect(state.logs).toHaveLength(0);
  });

  it("passes on QuickBooks' own text for a paid, voided or stale invoice", async () => {
    state.updateResponse = json(
      {
        Fault: {
          Error: [
            {
              Message: "Stale Object Error",
              Detail: "Stale Object Error : SyncToken is stale",
              code: "5010",
            },
          ],
        },
      },
      400,
    );

    const result = await run();

    expect(result).toMatchObject({ status: "error", httpStatus: 502 });
    expect(errorOf(result)).toContain("Stale Object");
    expect(state.eventWrites).toBe(0);
  });

  it("answers 502 when QuickBooks cannot be reached, or answers 200 without an invoice", async () => {
    state.updateNetworkError = new Error("fetch failed");
    expect(await run()).toMatchObject({ status: "error", httpStatus: 502, error: "fetch failed" });

    state.updateNetworkError = null;
    state.updateResponse = json({});
    expect(await run()).toMatchObject({ status: "error", httpStatus: 502 });
    expect(state.eventWrites).toBe(0);
  });
});

describe("updateInvoice — case 3, creating again after 'not found'", () => {
  beforeEach(() => {
    delete state.invoicesById["inv-1"];
  });

  it("with replaceMissing the invoice is created again, and the result is created", async () => {
    const result = await run({ replaceMissing: true });

    expect(result).toEqual({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-new",
      warnings: [],
    });
  });

  it("runs the create flow from the number check, with the Item looked up once", async () => {
    await run({ replaceMissing: true });

    expect(calls).toEqual([
      "load",
      "item",
      "qbo:read-invoice",
      "qbo:find-invoice",
      "customer",
      "zone-class",
      "qbo:create-invoice",
      "read-is-qbo",
      "save-link",
      "log:recreated",
      "log:is_qbo",
      "pdf",
    ]);
  });

  it("replaces only the old id's link", async () => {
    await run({ replaceMissing: true });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["eq", "qbo_invoice_id", "inv-1"],
    ]);
    expect(state.updates[0].values).toEqual({
      qbo_invoice_id: "inv-new",
      qbo_invoice_connection_uuid: "conn-1",
      qbo_invoice_sent_hash: "hash-A",
      qbo_invoice_mismatch: false,
      is_qbo: true,
    });
  });

  it("writes the Log as 'recreated', attaches the PDF as for a new invoice", async () => {
    await run({ replaceMissing: true });

    expect(state.logs).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "recreated", docNumber: "100200300" },
    ]);
    expect(state.pdfArgs).toEqual(["conn-1", "inv-new", EVENT_ID]);
    expect(calls).not.toContain("pdf-replace");
  });

  it("does not apply the booked rule", async () => {
    state.source = sourceOf({ eventStatus: "lost" });

    expect((await run({ replaceMissing: true })).status).toBe("created");
  });

  it("applies the validation and the company check", async () => {
    state.source = sourceOf({ invoiceNumber: null });
    expect(await run({ replaceMissing: true })).toMatchObject({ status: "error", httpStatus: 400 });
    expectNothingWritten();

    calls.length = 0;
    state.source = sourceOf({ qboInvoiceConnectionId: "conn-old" });
    state.connections = [
      { id: "conn-old", display_name: "BR USA" },
      { id: "conn-1", display_name: "BR Canada" },
    ];
    expect(await run({ replaceMissing: true })).toMatchObject({ status: "error", httpStatus: 409 });
    expectNothingWritten();
  });

  it("finding an invoice with the new number offers the overwrite instead, and writes nothing", async () => {
    state.invoicesByNumber = [
      {
        Id: "inv-77",
        DocNumber: "100200300",
        CustomerRef: { value: "9", name: "Pat" },
        TotalAmt: 8062.5,
      },
    ];

    expect(await run({ replaceMissing: true })).toEqual({
      status: "invoice_number_exists",
      invoice: { id: "inv-77", number: "100200300", customerName: "Pat", totalCents: 806250 },
    });
    expectNothingWritten();
  });

  it("asks for a customer when it has to, and writes nothing", async () => {
    state.customer = { kind: "choose", candidates: [] };

    expect((await run({ replaceMissing: true })).status).toBe("choose_customer");
    expectNothingWritten();
  });

  it("a Canadian quote that needs the no-tax code and has none is refused with 400", async () => {
    state.source = canadian({ taxCents: 0 });
    state.noTaxCode = null;

    expect(await run({ replaceMissing: true })).toMatchObject({ status: "error", httpStatus: 400 });
    expectNothingWritten();
  });

  it("replaceMissing on an invoice that is still there simply updates it", async () => {
    state.invoicesById["inv-1"] = { Id: "inv-1", SyncToken: "7", DocNumber: "100200300" };

    const result = await run({ replaceMissing: true });

    expect(result.status).toBe("updated");
    expect(calls).not.toContain("qbo:create-invoice");
  });
});

describe("overwriteInvoice — case 2, overwriting the invoice found by number", () => {
  beforeEach(() => {
    state.source = unlinked();
  });

  it("runs the steps in order and answers updated, with linkedExisting", async () => {
    const result = await overwrite();

    expect(result).toEqual({
      status: "updated",
      docNumber: "100200300",
      qboInvoiceId: "inv-77",
      linkedExisting: true,
      warnings: [],
    });
    expect(calls).toEqual([
      "load",
      "item",
      "qbo:read-invoice",
      "customer",
      "zone-class",
      "qbo:update-invoice",
      "read-is-qbo",
      "save-link",
      "log:linked",
      "log:is_qbo",
      "pdf-replace",
    ]);
  });

  it("reads the invoice of the id it was given, from the quote's connection, and updates that one", async () => {
    await overwrite({ overwriteInvoiceId: "inv-77" });

    expect(state.reads).toEqual(["inv-77"]);
    expect(state.readUrls[0]).toContain("/123/invoice/inv-77");
    expect(state.posts[0].body).toMatchObject({ Id: "inv-77", SyncToken: "3", sparse: true });
  });

  it("saves the id, the connection, the sent hash, no mismatch and is_qbo, guarded by IS NULL", async () => {
    await overwrite();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({
      qbo_invoice_id: "inv-77",
      qbo_invoice_connection_uuid: "conn-1",
      qbo_invoice_sent_hash: "hash-A",
      qbo_invoice_mismatch: false,
      is_qbo: true,
    });
    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["is", "qbo_invoice_id", null],
    ]);
  });

  it("reads is_qbo before the link is saved, and logs its second row only when it was unticked", async () => {
    await overwrite();
    expect(calls.indexOf("read-is-qbo")).toBeLessThan(calls.indexOf("save-link"));
    expect(state.logIsQbo).toEqual([{ eventId: EVENT_ID, userUuid: "user-1" }]);

    state.logIsQbo = [];
    state.isQbo = true;
    await overwrite();
    expect(state.logIsQbo).toHaveLength(0);
  });

  it("writes the Log as 'linked'", async () => {
    await overwrite();

    expect(state.logs).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "linked", docNumber: "100200300" },
    ]);
  });

  it("replaces the PDF of the overwritten invoice", async () => {
    await overwrite();

    expect(state.replaceArgs).toEqual(["conn-1", "inv-77", EVENT_ID]);
  });

  it("a PDF failure still returns updated, with the warning", async () => {
    state.replaceError = new Error("boom");

    expect(await overwrite()).toMatchObject({
      status: "updated",
      linkedExisting: true,
      warnings: [{ code: "pdf_not_attached", reason: "boom" }],
    });
  });

  it("applies the booked rule", async () => {
    for (const status of ["draft", "quoted", "unsigned_changes", "lost", null]) {
      calls.length = 0;
      state.source = unlinked({ eventStatus: status });

      const result = await overwrite();

      expect(result).toMatchObject({ status: "error", httpStatus: 400 });
      expect(errorOf(result)).toContain("booked");
      expect(calls).toEqual(["load"]);
      expectNothingWritten();
    }
  });

  it("applies the validation", async () => {
    state.source = unlinked({ invoiceNumber: null });

    const result = await overwrite();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(errorOf(result)).toMatch(/no invoice number/);
    expect(calls).toEqual(["load"]);
    expectNothingWritten();
  });

  it("refuses an id that points at no invoice with 400, and writes nothing", async () => {
    const result = await overwrite({ overwriteInvoiceId: "inv-99" });

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(errorOf(result)).toContain("inv-99");
    expect(calls).toEqual(["load", "item", "qbo:read-invoice"]);
    expectNothingWritten();
  });

  it("refuses an invoice with another number with 400, and writes nothing", async () => {
    state.invoicesById["inv-88"] = { Id: "inv-88", SyncToken: "0", DocNumber: "100200999" };

    const result = await overwrite({ overwriteInvoiceId: "inv-88" });

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(errorOf(result)).toContain("100200999");
    expect(errorOf(result)).toContain("100200300");
    expectNothingWritten();
  });

  it("a failing read is a 502, not a 400", async () => {
    state.readResponse = json(
      { Fault: { Error: [{ Message: "Bad", Detail: "boom", code: "3200" }] } },
      401,
    );

    expect(await overwrite()).toMatchObject({ status: "error", httpStatus: 502 });
    expectNothingWritten();
  });

  it("answers 404 when there is no such event", async () => {
    state.source = null;

    expect(await overwrite()).toMatchObject({ status: "error", httpStatus: 404 });
    expect(calls).toEqual(["load"]);
  });

  it("answers 409 when the quote already has an invoice and the request is not a relink", async () => {
    state.source = sourceOf();

    const result = await overwrite();

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect(errorOf(result)).toContain("already has");
    expect(calls).toEqual(["load"]);
    expectNothingWritten();
  });

  it("returns the candidates when the customer step asks, and writes nothing", async () => {
    state.customer = { kind: "choose", candidates: [] };

    expect(await overwrite()).toEqual({ status: "choose_customer", candidates: [] });
    expectNothingWritten();
  });

  it("a Canadian quote that needs the no-tax code and has none is refused with 400", async () => {
    state.source = unlinked({
      venue: { street: "1 King St", city: "Toronto", state: "ON", zip: "M5H 1A1" },
      canadianProvince: "ON",
      currency: "CAD",
      taxCents: 0,
    });
    state.noTaxCode = null;

    const result = await overwrite();

    expect(result).toMatchObject({ status: "error", httpStatus: 400 });
    expect(errorOf(result)).toContain("no tax");
    expectNothingWritten();
  });

  it("QuickBooks refusing the update is a 502, and nothing is saved", async () => {
    state.updateResponse = json(
      { Fault: { Error: [{ Message: "Bad", Detail: "Business validation" }] } },
      400,
    );

    expect(await overwrite()).toMatchObject({ status: "error", httpStatus: 502 });
    expect(state.eventWrites).toBe(0);
  });

  it("another request linked the same invoice first: carries on", async () => {
    state.updateRows = [];
    state.linkedId = "inv-77";

    const result = await overwrite();

    expect(result.status).toBe("updated");
    expect(calls).toContain("log:linked");
  });

  it("another request linked a different invoice first: 409, nothing after it", async () => {
    state.updateRows = [];
    state.linkedId = "inv-other";

    const result = await overwrite();

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect(errorOf(result)).toContain("100200300");
    expect(calls).not.toContain("log:linked");
    expect(calls).not.toContain("pdf-replace");
  });

  it("no row changed and none is linked: an error, not a silent success", async () => {
    state.updateRows = [];
    state.linkedId = null;

    await expect(overwrite()).rejects.toThrow(/link/i);
    expect(calls).not.toContain("pdf-replace");
  });
});

describe("overwriteInvoice — case 2, relinking a link that points at a missing invoice", () => {
  beforeEach(() => {
    state.source = sourceOf({ qboInvoiceId: "inv-old", qboInvoiceConnectionId: "conn-1" });
  });

  it("with replaceMissing it links the invoice found by number and answers updated", async () => {
    const result = await overwrite({ replaceMissing: true });

    expect(result).toEqual({
      status: "updated",
      docNumber: "100200300",
      qboInvoiceId: "inv-77",
      linkedExisting: true,
      warnings: [],
    });
  });

  it("replaces only the old id's link", async () => {
    await overwrite({ replaceMissing: true });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].filters).toEqual([
      ["eq", "id", EVENT_ID],
      ["eq", "qbo_invoice_id", "inv-old"],
    ]);
    expect(state.updates[0].values).toMatchObject({
      qbo_invoice_id: "inv-77",
      qbo_invoice_connection_uuid: "conn-1",
      qbo_invoice_mismatch: false,
      is_qbo: true,
    });
  });

  it("does not apply the booked rule", async () => {
    state.source = sourceOf({
      eventStatus: "lost",
      qboInvoiceId: "inv-old",
      qboInvoiceConnectionId: "conn-1",
    });

    expect((await overwrite({ replaceMissing: true })).status).toBe("updated");
  });

  it("still applies the validation", async () => {
    state.source = sourceOf({
      invoiceNumber: null,
      qboInvoiceId: "inv-old",
      qboInvoiceConnectionId: "conn-1",
    });

    expect(await overwrite({ replaceMissing: true })).toMatchObject({
      status: "error",
      httpStatus: 400,
    });
    expectNothingWritten();
  });

  it("still applies the company check, before anything else", async () => {
    state.source = sourceOf({ qboInvoiceId: "inv-old", qboInvoiceConnectionId: "conn-old" });
    state.connections = [
      { id: "conn-old", display_name: "BR USA" },
      { id: "conn-1", display_name: "BR Canada" },
    ];

    const result = await overwrite({ replaceMissing: true });

    expect(result).toMatchObject({ status: "error", httpStatus: 409 });
    expect(errorOf(result)).toContain("BR USA");
    expect(calls).toEqual(["load", "connections"]);
    expectNothingWritten();
  });

  it("writes the Log as 'linked'", async () => {
    await overwrite({ replaceMissing: true });

    expect(state.logs).toEqual([
      { eventId: EVENT_ID, userUuid: "user-1", kind: "linked", docNumber: "100200300" },
    ]);
  });

  it("refuses an invoice with another number, and writes nothing", async () => {
    state.invoicesById["inv-88"] = { Id: "inv-88", SyncToken: "0", DocNumber: "100200999" };

    expect(await overwrite({ replaceMissing: true, overwriteInvoiceId: "inv-88" })).toMatchObject({
      status: "error",
      httpStatus: 400,
    });
    expectNothingWritten();
  });
});

describe("readLinkedInvoiceId", () => {
  it("returns the invoice id the event is linked to", async () => {
    state.linkedId = "inv-1";

    expect(await readLinkedInvoiceId(EVENT_ID)).toBe("inv-1");
    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });

  it("returns null for an event with no link, or no event", async () => {
    state.linkedId = null;

    expect(await readLinkedInvoiceId(EVENT_ID)).toBeNull();
  });

  it("throws when the read fails", async () => {
    state.linkReadError = { message: "boom" };

    await expect(readLinkedInvoiceId(EVENT_ID)).rejects.toThrow(/boom/);
  });
});
