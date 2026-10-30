import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-06-totals-check.md §3 and §10: readQboInvoice returns, beside what an
// update needs, a snapshot of every value the comparison reads. QuickBooks is a fake fetch.

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: async () => ({ accessToken: "tok", realmId: "123" }),
}));

import { readQboInvoice } from "./qboInvoiceApi";

let reply: { status: number; body: unknown };

beforeEach(() => {
  reply = { status: 200, body: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(reply.body), { status: reply.status })),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** What QuickBooks sends for an invoice the app wrote: its sales-item line, and QuickBooks' own subtotal line. */
const rawInvoice = (over: Record<string, unknown> = {}) => ({
  Id: "inv-1",
  SyncToken: "3",
  DocNumber: "100200300",
  TxnDate: "2026-11-01",
  DueDate: "2026-10-15",
  CustomerRef: { value: "cust-1", name: "Pat Lee" },
  BillAddr: { Id: "9", Line1: "Pat Lee" },
  ShipAddr: {
    Id: "10",
    Line1: "1 Main St",
    City: "Clemson",
    CountrySubDivisionCode: "SC",
    PostalCode: "29631",
  },
  PrivateNote: "SC - CLEMSON - RALLY",
  TotalAmt: 8025,
  TxnTaxDetail: { TotalTax: 525 },
  Line: [
    {
      Id: "1",
      DetailType: "SalesItemLineDetail",
      Amount: 7500,
      Description: "Seats",
      SalesItemLineDetail: {
        ItemRef: { value: "item-1", name: "Bleacher Rental - Corporate" },
        TaxCodeRef: { value: "TAX" },
        ClassRef: { value: "class-1", name: "East" },
      },
    },
    { DetailType: "SubTotalLineDetail", Amount: 7500, SubTotalLineDetail: {} },
  ],
  ...over,
});

const read = async (invoice = rawInvoice()) => {
  reply = { status: 200, body: { Invoice: invoice } };
  return readQboInvoice("conn-1", "inv-1");
};

describe("readQboInvoice — what an update needs", () => {
  it("returns the id, the SyncToken and the number", async () => {
    expect(await read()).toMatchObject({ id: "inv-1", syncToken: "3", docNumber: "100200300" });
  });

  it("asks QuickBooks for the invoice by its id", async () => {
    await read();

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("https://qbo.example.com/v3/company/123/invoice/inv-1");
  });
});

describe("readQboInvoice — the snapshot", () => {
  it("holds every value the comparison reads, as text and whole cents", async () => {
    expect((await read())!.snapshot).toEqual({
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
    });
  });

  it("leaves out the lines that are not sales-item lines (QuickBooks' subtotal, discount)", async () => {
    const snapshot = (await read(
      rawInvoice({
        Line: [
          ...(rawInvoice().Line as unknown[]),
          { DetailType: "DiscountLineDetail", Amount: 10, DiscountLineDetail: {} },
        ],
      }),
    ))!.snapshot;

    expect(snapshot.lines).toHaveLength(1);
  });

  it("a line with no Class has a classId of null", async () => {
    const line = {
      DetailType: "SalesItemLineDetail",
      Amount: 7500,
      SalesItemLineDetail: { ItemRef: { value: "item-1" }, TaxCodeRef: { value: "TAX" } },
    };

    expect((await read(rawInvoice({ Line: [line] })))!.snapshot.lines[0]).toMatchObject({
      classId: null,
      description: "",
    });
  });

  it("amounts that arrive as strings are read", async () => {
    const snapshot = (await read(
      rawInvoice({ TotalAmt: "8025.00", TxnTaxDetail: { TotalTax: "525.00" } }),
    ))!.snapshot;

    expect(snapshot).toMatchObject({ totalCents: 802500, taxCents: 52500 });
  });

  it("an invoice with no TxnTaxDetail has a tax of 0", async () => {
    const snapshot = (await read(rawInvoice({ TotalAmt: 7500, TxnTaxDetail: undefined })))!
      .snapshot;

    expect(snapshot.taxCents).toBe(0);
  });

  it("an invoice with a TxnTaxDetail but no TotalTax has a tax of 0", async () => {
    expect((await read(rawInvoice({ TxnTaxDetail: {} })))!.snapshot.taxCents).toBe(0);
  });

  it("a missing total, or a total or tax that is not an amount, is null and does not throw", async () => {
    expect((await read(rawInvoice({ TotalAmt: undefined })))!.snapshot.totalCents).toBeNull();
    expect((await read(rawInvoice({ TotalAmt: "n/a" })))!.snapshot.totalCents).toBeNull();
    expect(
      (await read(rawInvoice({ TxnTaxDetail: { TotalTax: "n/a" } })))!.snapshot.taxCents,
    ).toBeNull();
  });

  it("an invoice with nothing but its id still reads: every value is empty, no line", async () => {
    const snapshot = (await read({ Id: "inv-1", SyncToken: "0" } as ReturnType<typeof rawInvoice>))!
      .snapshot;

    expect(snapshot).toEqual({
      docNumber: "",
      txnDate: "",
      dueDate: "",
      customerId: "",
      billToLine1: "",
      ship: { street: "", city: "", state: "", zip: "" },
      memo: "",
      lines: [],
      totalCents: null,
      taxCents: 0,
    });
  });
});

describe("readQboInvoice — an invoice QuickBooks does not have, and failures", () => {
  it("a not-found fault (code 610) is null", async () => {
    reply = {
      status: 400,
      body: { Fault: { Error: [{ Message: "Object Not Found", Detail: "x", code: "610" }] } },
    };

    expect(await readQboInvoice("conn-1", "inv-1")).toBeNull();
  });

  it("any other fault throws with its detail", async () => {
    reply = { status: 500, body: { Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } } };

    await expect(readQboInvoice("conn-1", "inv-1")).rejects.toThrow(/boom/);
  });

  it("an answer with no invoice throws", async () => {
    reply = { status: 200, body: {} };

    await expect(readQboInvoice("conn-1", "inv-1")).rejects.toThrow(/carried no invoice/);
  });
});
