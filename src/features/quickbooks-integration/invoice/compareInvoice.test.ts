import { describe, expect, it } from "vitest";
import { compareInvoice, dollarsToCents } from "./compareInvoice";
import type { QboInvoiceBody, QboInvoiceSnapshot } from "./invoiceTypes";

// docs/specs/qbo-invoice-06-totals-check.md §3, §4 and §10: the pure comparison of the invoice we
// would write today (the builder's body) with the invoice QuickBooks holds.

/** The invoice the builder writes for a US quote: $7,500.00 plus $525.00 tax. */
const expected = (): QboInvoiceBody => ({
  DocNumber: "100200300",
  TxnDate: "2026-11-01",
  DueDate: "2026-10-15",
  CustomerRef: { value: "cust-1" },
  BillAddr: { Line1: "Pat Lee" },
  ShipAddr: {
    Line1: "1 Main St",
    City: "Clemson",
    CountrySubDivisionCode: "SC",
    PostalCode: "29631",
  },
  PrivateNote: "SC - CLEMSON - RALLY",
  GlobalTaxCalculation: "TaxExcluded",
  Line: [
    {
      DetailType: "SalesItemLineDetail",
      Amount: "7500.00",
      Description: "Seats",
      SalesItemLineDetail: {
        ItemRef: { value: "item-1", name: "Bleacher Rental - Corporate" },
        Qty: 1,
        UnitPrice: "7500.00",
        TaxCodeRef: { value: "TAX" },
        ClassRef: { value: "class-1" },
      },
    },
  ],
});

/** QuickBooks holds exactly that invoice, with the tax it calculated. */
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

const quote = { totalCents: 802500, taxCents: 52500 };

const compare = (actual: QboInvoiceSnapshot, body: QboInvoiceBody = expected()) =>
  compareInvoice({ expected: body, quote, actual });

/** The first line of a snapshot with some of its values changed. */
const withLine = (over: Partial<QboInvoiceSnapshot["lines"][number]>) => ({
  lines: [{ ...snapshot().lines[0], ...over }],
});

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

describe("compareInvoice — an invoice that is the quote's", () => {
  it("matches: no reasons, no differences", () => {
    expect(compare(snapshot())).toEqual({ matches: true, reasons: [], differences: [] });
  });

  it("compares text trimmed, and a missing value with an empty one", () => {
    const actual = snapshot({
      memo: "  SC - CLEMSON - RALLY ",
      billToLine1: "Pat Lee  ",
      ship: { street: "1 Main St ", city: "Clemson", state: "SC", zip: "29631" },
    });
    expect(compare(actual).matches).toBe(true);

    const body = expected();
    body.ShipAddr.City = "";
    const noCity = snapshot({ ship: { street: "1 Main St", city: "", state: "SC", zip: "29631" } });
    expect(compare(noCity, body).matches).toBe(true);
  });

  it("compares dates as YYYY-MM-DD", () => {
    expect(
      compare(snapshot({ txnDate: "2026-11-01T00:00:00", dueDate: "2026-10-15" })).matches,
    ).toBe(true);
  });

  it("'no Class' equals 'no Class'", () => {
    const body = expected();
    delete body.Line[0].SalesItemLineDetail.ClassRef;

    expect(compare(snapshot(withLine({ classId: null })), body).matches).toBe(true);
  });

  it("an empty description equals an absent one", () => {
    const body = expected();
    delete body.Line[0].Description;

    expect(compare(snapshot(withLine({ description: "" })), body).matches).toBe(true);
  });
});

describe("compareInvoice — each reason on its own", () => {
  it.each([
    [
      "number",
      snapshot({ docNumber: "100200301" }),
      [{ reason: "number", field: "Invoice number", quote: "100200300", qbo: "100200301" }],
    ],
    [
      "dates (the invoice date)",
      snapshot({ txnDate: "2026-11-02" }),
      [{ reason: "dates", field: "Invoice date", quote: "2026-11-01", qbo: "2026-11-02" }],
    ],
    [
      "dates (the due date)",
      snapshot({ dueDate: "2026-10-20" }),
      [{ reason: "dates", field: "Due date", quote: "2026-10-15", qbo: "2026-10-20" }],
    ],
    [
      "customer (the customer)",
      snapshot({ customerId: "cust-2" }),
      [{ reason: "customer", field: "Customer", quote: "cust-1", qbo: "cust-2" }],
    ],
    [
      "customer (Bill to)",
      snapshot({ billToLine1: "Pat Leigh" }),
      [{ reason: "customer", field: "Bill to", quote: "Pat Lee", qbo: "Pat Leigh" }],
    ],
    [
      "address (the street)",
      snapshot({ ship: { street: "2 Main St", city: "Clemson", state: "SC", zip: "29631" } }),
      [{ reason: "address", field: "Street", quote: "1 Main St", qbo: "2 Main St" }],
    ],
    [
      "address (the city)",
      snapshot({ ship: { street: "1 Main St", city: "Easley", state: "SC", zip: "29631" } }),
      [{ reason: "address", field: "City", quote: "Clemson", qbo: "Easley" }],
    ],
    [
      "address (the state)",
      snapshot({ ship: { street: "1 Main St", city: "Clemson", state: "NC", zip: "29631" } }),
      [{ reason: "address", field: "State", quote: "SC", qbo: "NC" }],
    ],
    [
      "address (the zip)",
      snapshot({ ship: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29632" } }),
      [{ reason: "address", field: "ZIP code", quote: "29631", qbo: "29632" }],
    ],
    [
      "memo",
      snapshot({ memo: "SC - CLEMSON - TAILGATE" }),
      [
        {
          reason: "memo",
          field: "Memo",
          quote: "SC - CLEMSON - RALLY",
          qbo: "SC - CLEMSON - TAILGATE",
        },
      ],
    ],
    [
      "service (the Item)",
      snapshot(withLine({ itemId: "item-2" })),
      [{ reason: "service", field: "Service", quote: "item-1", qbo: "item-2" }],
    ],
    [
      "service (the description)",
      snapshot(withLine({ description: "Other seats" })),
      [{ reason: "service", field: "Description", quote: "Seats", qbo: "Other seats" }],
    ],
    [
      "class",
      snapshot(withLine({ classId: "class-2" })),
      [{ reason: "class", field: "Class", quote: "class-1", qbo: "class-2" }],
    ],
  ] as const)("%s", (_label, actual, differences) => {
    const result = compare(actual as QboInvoiceSnapshot);

    expect(result.matches).toBe(false);
    expect(result.reasons).toEqual([differences[0].reason]);
    expect(result.differences).toEqual(differences);
  });

  it("a Class QuickBooks has and the quote does not is a class difference", () => {
    const body = expected();
    delete body.Line[0].SalesItemLineDetail.ClassRef;

    const result = compare(snapshot(), body);

    expect(result.differences).toEqual([
      { reason: "class", field: "Class", quote: "none", qbo: "class-1" },
    ]);
  });

  it("the amount alone, with the total moving with it, is one reason: amount, not totals", () => {
    const result = compare(snapshot({ ...withLine({ amountCents: 760000 }), totalCents: 812500 }));

    expect(result.reasons).toEqual(["amount"]);
    expect(result.differences).toEqual([
      { reason: "amount", field: "Amount", quote: "$7,500.00", qbo: "$7,600.00" },
    ]);
  });

  it("the tax code alone, with the tax moving with it, is one reason: tax_code, not totals", () => {
    const result = compare(
      snapshot({ ...withLine({ taxCodeId: "NON" }), taxCents: 0, totalCents: 750000 }),
    );

    expect(result.reasons).toEqual(["tax_code"]);
    expect(result.differences).toEqual([
      { reason: "tax_code", field: "Tax code", quote: "TAX", qbo: "NON" },
    ]);
  });

  it("only QuickBooks' total or tax differing is reason totals, one difference each", () => {
    expect(compare(snapshot({ totalCents: 802501 })).differences).toEqual([
      { reason: "totals", field: "Total", quote: "$8,025.00", qbo: "$8,025.01" },
    ]);
    expect(compare(snapshot({ taxCents: 52501 })).differences).toEqual([
      { reason: "totals", field: "Tax", quote: "$525.00", qbo: "$525.01" },
    ]);
    expect(compare(snapshot({ totalCents: 800000, taxCents: 50000 })).differences).toHaveLength(2);
  });

  it("one cent apart is a difference: there is no tolerance", () => {
    expect(compare(snapshot({ taxCents: 52501 })).reasons).toEqual(["totals"]);
    expect(compare(snapshot(withLine({ amountCents: 750001 }))).reasons).toEqual(["amount"]);
  });
});

describe("compareInvoice — the lines", () => {
  it("no sales-item line is reason lines, and the line's own fields are not compared", () => {
    const result = compare(snapshot({ lines: [] }));

    expect(result.reasons).toEqual(["lines"]);
    expect(result.differences).toEqual([
      { reason: "lines", field: "Number of lines", quote: "1", qbo: "0" },
    ]);
  });

  it("two sales-item lines are reason lines too", () => {
    const line = snapshot().lines[0];
    const result = compare(snapshot({ lines: [line, { ...line, amountCents: 100 }] }));

    expect(result.reasons).toEqual(["lines"]);
    expect(result.differences[0]).toMatchObject({ field: "Number of lines", qbo: "2" });
  });

  it("the totals are not reported on top of a lines difference", () => {
    const result = compare(snapshot({ lines: [], totalCents: 0, taxCents: 0 }));

    expect(result.reasons).toEqual(["lines"]);
  });
});

describe("compareInvoice — the customer the contact is not linked to", () => {
  it("always differs: there is no expected customer", () => {
    const body = expected();
    body.CustomerRef.value = "";

    const result = compare(snapshot(), body);

    expect(result.reasons).toEqual(["customer"]);
    expect(result.differences).toEqual([
      { reason: "customer", field: "Customer", quote: "not linked yet", qbo: "cust-1" },
    ]);
  });
});

describe("compareInvoice — several reasons", () => {
  it("come in the order of the spec, without repeats, whatever the order the fields differ in", () => {
    const result = compare(
      snapshot({
        memo: "other",
        dueDate: "2026-10-20",
        txnDate: "2026-11-05",
        docNumber: "1",
        ship: { street: "2 Main St", city: "Easley", state: "SC", zip: "29631" },
      }),
    );

    expect(result.matches).toBe(false);
    expect(result.reasons).toEqual(["number", "dates", "address", "memo"]);
    expect(result.differences.map((d) => d.field)).toEqual([
      "Invoice number",
      "Invoice date",
      "Due date",
      "Street",
      "City",
      "Memo",
    ]);
  });

  it("totals are reported with the reasons that are not money lines", () => {
    const result = compare(snapshot({ memo: "other", taxCents: 52501 }));

    expect(result.reasons).toEqual(["memo", "totals"]);
  });
});
