import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource } from "./invoiceTypes";

// docs/specs/qbo-invoice-06-totals-check.md §3 and §9: the pure comparison, then runTotalsCheck with
// QuickBooks (a fake fetch, through the real invoice API) and the database replaced by fakes.

const { state, createClient, getTokens } = vi.hoisted(() => {
  const state = {
    invoices: {} as Record<string, unknown>,
    readUrls: [] as string[],
    readResponse: null as { status: number; body: string } | null,
    readNetworkError: null as Error | null,
    updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: unknown[] }>,
    updateError: null as { message: string } | null,
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
          state.updates.push({ table, values: ctx.values, filters: ctx.filters });
          return Promise.resolve({ error: state.updateError }).then(resolve, reject);
        },
      };
      return chain;
    },
  }));
  const getTokens = vi.fn(async (_connectionId: string) => ({
    accessToken: "tok",
    realmId: "123",
  }));
  return { state, createClient, getTokens };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: (...args: [string]) => getTokens(...args),
}));

import {
  QboReadError,
  compareInvoiceTotals,
  dollarsToCents,
  runTotalsCheck,
} from "./checkInvoiceTotals";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

/** A quote whose total is 8025.00 with 525.00 of tax, invoiced in a company the office no longer uses. */
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
    billedContact: null,
    billToName: "Pat Lee",
    amountCents: 750000,
    taxCents: 52500,
    currency: "USD",
    canadianProvince: null,
    salesOfficeId: "office-1",
    connectionId: "conn-office",
    qboInvoiceId: "inv-1",
    qboInvoiceConnectionId: "conn-stored",
    qboInvoiceHash: "hash-A",
    qboInvoiceSentHash: "hash-A",
    qboInvoiceMismatch: false,
    ...over,
  };
}

/** What QuickBooks sends for an invoice: dollars, and the tax under TxnTaxDetail. */
const qboInvoice = (over: Record<string, unknown> = {}) => ({
  Id: "inv-1",
  SyncToken: "3",
  DocNumber: "100200300",
  TotalAmt: 8025,
  TxnTaxDetail: { TotalTax: 525 },
  ...over,
});

const json = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

const NOT_FOUND = json(
  {
    Fault: {
      Error: [{ Message: "Object Not Found", Detail: "Object Not Found : inactive", code: "610" }],
    },
  },
  400,
);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  createClient.mockClear();
  getTokens.mockClear();
  Object.assign(state, {
    invoices: { "inv-1": qboInvoice() },
    readUrls: [],
    readResponse: null,
    readNetworkError: null,
    updates: [],
    updateError: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const read = new URL(url).pathname.match(/\/invoice\/([^/]+)$/);
      if (!read) throw new Error(`unexpected fetch ${url}`);
      state.readUrls.push(url);
      if (state.readNetworkError) throw state.readNetworkError;
      if (state.readResponse)
        return new Response(state.readResponse.body, { status: state.readResponse.status });
      const found = state.invoices[decodeURIComponent(read[1])];
      if (!found) return new Response(NOT_FOUND.body, { status: NOT_FOUND.status });
      return new Response(JSON.stringify({ Invoice: found }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("dollarsToCents", () => {
  it.each([
    ["a whole number", 8032, 803200],
    ["one decimal", 8032.5, 803250],
    ["two decimals", 1234.56, 123456],
    ["zero", 0, 0],
    ["a value whose float product is off", 19.99, 1999],
    ["a value whose float product is above", 0.07, 7],
    ["a string with two decimals", "8032.50", 803250],
    ["a string of whole dollars", "12", 1200],
    ["a string with one decimal", "0.1", 10],
  ] as Array<[string, number | string, number]>)(
    "turns %s into whole cents",
    (_label, value, cents) => {
      expect(dollarsToCents(value)).toBe(cents);
    },
  );

  it.each([["abc"], [""], ["  "], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "refuses %j, which is not an amount",
    (value) => {
      expect(() => dollarsToCents(value as number | string)).toThrow(/not a number/);
    },
  );
});

describe("compareInvoiceTotals", () => {
  const compare = (
    quote: { totalCents: number; taxCents: number },
    qbo: { totalCents: number; taxCents: number },
  ) => compareInvoiceTotals({ quote, qbo });

  it("matches when the total and the tax are equal", () => {
    expect(
      compare({ totalCents: 802500, taxCents: 52500 }, { totalCents: 802500, taxCents: 52500 }),
    ).toEqual({
      matches: true,
      differences: [],
    });
  });

  it("a different total alone is one difference, named total", () => {
    expect(
      compare({ totalCents: 802500, taxCents: 52500 }, { totalCents: 802600, taxCents: 52500 }),
    ).toEqual({
      matches: false,
      differences: [{ field: "total", quoteCents: 802500, qboCents: 802600 }],
    });
  });

  it("a different tax alone is one difference, named tax", () => {
    expect(
      compare({ totalCents: 802500, taxCents: 52500 }, { totalCents: 802500, taxCents: 52400 }),
    ).toEqual({
      matches: false,
      differences: [{ field: "tax", quoteCents: 52500, qboCents: 52400 }],
    });
  });

  it("both different give two differences, the total first", () => {
    expect(
      compare({ totalCents: 802500, taxCents: 52500 }, { totalCents: 800000, taxCents: 50000 }),
    ).toEqual({
      matches: false,
      differences: [
        { field: "total", quoteCents: 802500, qboCents: 800000 },
        { field: "tax", quoteCents: 52500, qboCents: 50000 },
      ],
    });
  });

  it("one cent apart is a mismatch: there is no tolerance", () => {
    const result = compare(
      { totalCents: 802500, taxCents: 52500 },
      { totalCents: 802500, taxCents: 52501 },
    );

    expect(result.matches).toBe(false);
    expect(result.differences).toEqual([{ field: "tax", quoteCents: 52500, qboCents: 52501 }]);
  });
});

describe("runTotalsCheck — the comparison and the flag", () => {
  it("matching totals: checked, matches, and the flag is stored false", async () => {
    const result = await runTotalsCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({ status: "checked", matches: true, differences: [] });
    expect(state.updates).toEqual([
      {
        table: "Events",
        values: { qbo_invoice_mismatch: false },
        filters: [["eq", "id", EVENT_ID]],
      },
    ]);
  });

  it("the quote's total is the amount after discounts plus the tax", async () => {
    state.invoices["inv-1"] = qboInvoice({ TotalAmt: 8025.01 });

    const result = await runTotalsCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({
      status: "checked",
      matches: false,
      differences: [{ field: "total", quoteCents: 802500, qboCents: 802501 }],
    });
  });

  it("QuickBooks' tax one cent off: one tax difference, and the flag is stored true", async () => {
    state.invoices["inv-1"] = qboInvoice({ TxnTaxDetail: { TotalTax: 525.01 } });

    const result = await runTotalsCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({
      status: "checked",
      matches: false,
      differences: [{ field: "tax", quoteCents: 52500, qboCents: 52501 }],
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({ qbo_invoice_mismatch: true });
  });

  it("sets the flag true, then false on a later match", async () => {
    state.invoices["inv-1"] = qboInvoice({ TxnTaxDetail: { TotalTax: 525.01 } });
    await runTotalsCheck(EVENT_ID, sourceOf());

    state.invoices["inv-1"] = qboInvoice();
    const again = await runTotalsCheck(EVENT_ID, sourceOf());

    expect(again).toMatchObject({ status: "checked", matches: true });
    expect(state.updates.map((u) => u.values)).toEqual([
      { qbo_invoice_mismatch: true },
      { qbo_invoice_mismatch: false },
    ]);
  });

  it("an invoice with no TxnTaxDetail has a tax of 0", async () => {
    state.invoices["inv-1"] = qboInvoice({ TotalAmt: 7500, TxnTaxDetail: undefined });

    const untaxed = await runTotalsCheck(EVENT_ID, sourceOf({ taxCents: 0 }));
    expect(untaxed).toEqual({ status: "checked", matches: true, differences: [] });

    const taxedQuote = await runTotalsCheck(EVENT_ID, sourceOf());
    expect(taxedQuote).toMatchObject({
      matches: false,
      differences: expect.arrayContaining([{ field: "tax", quoteCents: 52500, qboCents: 0 }]),
    });
  });

  it("reads QuickBooks' amounts when they arrive as strings", async () => {
    state.invoices["inv-1"] = qboInvoice({
      TotalAmt: "8025.00",
      TxnTaxDetail: { TotalTax: "525.00" },
    });

    expect(await runTotalsCheck(EVENT_ID, sourceOf())).toMatchObject({ matches: true });
  });

  it("writes with the service role", async () => {
    await runTotalsCheck(EVENT_ID, sourceOf());

    expect(createClient).toHaveBeenCalledWith("http://localhost:54321", "service-key");
  });
});

describe("runTotalsCheck — which invoice it reads", () => {
  it("reads the invoice by the stored id, in the stored connection and not the office's", async () => {
    await runTotalsCheck(EVENT_ID, sourceOf());

    expect(getTokens).toHaveBeenCalledWith("conn-stored");
    expect(getTokens).not.toHaveBeenCalledWith("conn-office");
    expect(state.readUrls).toHaveLength(1);
    expect(state.readUrls[0]).toContain("https://qbo.example.com/v3/company/123/invoice/inv-1");
  });

  it("refuses a quote that has no invoice, and reads nothing", async () => {
    await expect(runTotalsCheck(EVENT_ID, sourceOf({ qboInvoiceId: null }))).rejects.toThrow(
      /no QuickBooks invoice/,
    );
    await expect(
      runTotalsCheck(EVENT_ID, sourceOf({ qboInvoiceConnectionId: null })),
    ).rejects.toThrow(/no QuickBooks invoice/);

    expect(state.readUrls).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe("runTotalsCheck — an invoice QuickBooks no longer has", () => {
  it("returns missing and writes nothing", async () => {
    state.invoices = {};

    const result = await runTotalsCheck(EVENT_ID, sourceOf());

    expect(result).toEqual({ status: "missing" });
    expect(state.updates).toHaveLength(0);
  });
});

describe("runTotalsCheck — a check that fails", () => {
  it("QuickBooks unreachable: a QboReadError with its message, and the flag is left alone", async () => {
    state.readNetworkError = new Error("fetch failed");

    const failure = await runTotalsCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toBe("fetch failed");
    expect(state.updates).toHaveLength(0);
  });

  it("a connection that lost its token: a QboReadError with the readable message", async () => {
    getTokens.mockRejectedValueOnce(
      new Error("QuickBooks connection needs to be re-authenticated (invalid_grant)."),
    );

    const failure = await runTotalsCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toContain("re-authenticated");
    expect(state.updates).toHaveLength(0);
  });

  it("a QuickBooks fault that is not 'not found': a QboReadError, the flag is left alone", async () => {
    state.readResponse = json({ Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } }, 500);

    const failure = await runTotalsCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(failure.message).toContain("boom");
    expect(state.updates).toHaveLength(0);
  });

  it.each([
    ["no total", { TotalAmt: undefined }],
    ["a total that is not an amount", { TotalAmt: "n/a" }],
    ["a tax that is not an amount", { TxnTaxDetail: { TotalTax: "n/a" } }],
  ])("an unreadable reply (%s): a QboReadError, the flag is left alone", async (_label, over) => {
    state.invoices["inv-1"] = qboInvoice(over);

    const failure = await runTotalsCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(QboReadError);
    expect(state.updates).toHaveLength(0);
  });

  it("the flag not saving is an ordinary error, not QuickBooks' fault", async () => {
    state.updateError = { message: "connection refused" };

    const failure = await runTotalsCheck(EVENT_ID, sourceOf()).catch((e) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(QboReadError);
    expect(failure.message).toContain("connection refused");
  });
});
