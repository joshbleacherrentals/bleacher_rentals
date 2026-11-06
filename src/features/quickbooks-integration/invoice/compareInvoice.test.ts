import { describe, expect, it } from "vitest";
import { compareInvoice, dollarsToCents } from "./compareInvoice";
import type { ClassPlacement, QboInvoiceBody, QboInvoiceSnapshot } from "./invoiceTypes";

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
  ship: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29631", other: [] },
  memo: "SC - CLEMSON - RALLY",
  headerClassId: null,
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

const compare = (
  actual: QboInvoiceSnapshot,
  body: QboInvoiceBody = expected(),
  classPlacement: ClassPlacement = "line",
) => compareInvoice({ expected: body, quote, actual, classPlacement });

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
      ship: { street: "1 Main St ", city: "Clemson", state: "SC", zip: "29631", other: [] },
    });
    expect(compare(actual).matches).toBe(true);

    const body = expected();
    body.ShipAddr.City = "";
    const noCity = snapshot({
      ship: { street: "1 Main St", city: "", state: "SC", zip: "29631", other: [] },
    });
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
      snapshot({
        ship: { street: "2 Main St", city: "Clemson", state: "SC", zip: "29631", other: [] },
      }),
      [{ reason: "address", field: "Street", quote: "1 Main St", qbo: "2 Main St" }],
    ],
    [
      "address (the city)",
      snapshot({
        ship: { street: "1 Main St", city: "Easley", state: "SC", zip: "29631", other: [] },
      }),
      [{ reason: "address", field: "City", quote: "Clemson", qbo: "Easley" }],
    ],
    [
      "address (the state)",
      snapshot({
        ship: { street: "1 Main St", city: "Clemson", state: "NC", zip: "29631", other: [] },
      }),
      [{ reason: "address", field: "State", quote: "SC", qbo: "NC" }],
    ],
    [
      "address (the zip)",
      snapshot({
        ship: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29632", other: [] },
      }),
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

  // The total is compared before tax, and the tax on its own, so a tax QuickBooks did not save is
  // reported once, as the tax, and not again as a total that is off by the same amount.
  it("only QuickBooks' total before tax or tax differing is reason totals, one difference each", () => {
    expect(compare(snapshot({ totalCents: 802501 })).differences).toEqual([
      { reason: "totals", field: "Total before tax", quote: "$7,500.00", qbo: "$7,500.01" },
    ]);
    // QuickBooks' total moves with its tax, as it does in a real invoice.
    expect(compare(snapshot({ totalCents: 802501, taxCents: 52501 })).differences).toEqual([
      { reason: "totals", field: "Tax", quote: "$525.00", qbo: "$525.01" },
    ]);
    expect(compare(snapshot({ totalCents: 810000, taxCents: 50000 })).differences).toEqual([
      { reason: "totals", field: "Total before tax", quote: "$7,500.00", qbo: "$7,600.00" },
      { reason: "totals", field: "Tax", quote: "$525.00", qbo: "$500.00" },
    ]);
  });

  it("QuickBooks saved no tax: the total before tax matches, so only the tax is reported", () => {
    const result = compare(snapshot({ totalCents: 750000, taxCents: 0 }));

    expect(result.matches).toBe(false);
    expect(result.reasons).toEqual(["totals"]);
    expect(result.differences).toEqual([
      { reason: "totals", field: "Tax", quote: "$525.00", qbo: "$0.00" },
    ]);
  });

  it("a quote with no tax and an invoice with none match", () => {
    const body = expected();
    body.Line[0].SalesItemLineDetail.TaxCodeRef.value = "NON";
    const result = compareInvoice({
      expected: body,
      quote: { totalCents: 750000, taxCents: 0 },
      actual: snapshot({
        ...withLine({ taxCodeId: "NON" }),
        totalCents: 750000,
        taxCents: 0,
      }),
      classPlacement: "line",
    });

    expect(result).toEqual({ matches: true, reasons: [], differences: [] });
  });

  it("an amount that is not one is unreadable, in the total before tax as well as the tax", () => {
    const result = compare(snapshot({ totalCents: null, taxCents: null }));

    expect(result.differences).toEqual([
      { reason: "totals", field: "Total before tax", quote: "$7,500.00", qbo: "unreadable" },
      { reason: "totals", field: "Tax", quote: "$525.00", qbo: "unreadable" },
    ]);
  });

  it("one cent apart is a difference: there is no tolerance", () => {
    expect(compare(snapshot({ totalCents: 802501, taxCents: 52501 })).reasons).toEqual(["totals"]);
    expect(compare(snapshot(withLine({ amountCents: 750001 }))).reasons).toEqual(["amount"]);
  });
});

// docs/specs/qbo-invoice-03f-canadian-class-on-header.md §4 and §7: where the Class is read from
// follows where it was written: the line, the invoice's own field (the header), or nowhere.
describe("compareInvoice — the Class by the company's setting", () => {
  /** The invoice the builder writes for a company whose Class is the invoice's own. */
  const headerBody = (classId: string | null = "class-1"): QboInvoiceBody => {
    const body = expected();
    delete body.Line[0].SalesItemLineDetail.ClassRef;
    if (classId) body.ClassRef = { value: classId };
    return body;
  };

  describe("header", () => {
    it("the same Class on the invoice's own field is no difference", () => {
      const result = compare(
        snapshot({ headerClassId: "class-1", ...withLine({ classId: null }) }),
        headerBody(),
        "header",
      );

      expect(result).toEqual({ matches: true, reasons: [], differences: [] });
    });

    it("QuickBooks holding none against a quote Class is one class difference", () => {
      const result = compare(
        snapshot({ headerClassId: null, ...withLine({ classId: null }) }),
        headerBody("1000000001"),
        "header",
      );

      expect(result.reasons).toEqual(["class"]);
      expect(result.differences).toEqual([
        { reason: "class", field: "Class", quote: "1000000001", qbo: "none" },
      ]);
    });

    it("a Class on the line only still differs: the line is not looked at", () => {
      const result = compare(
        snapshot({ headerClassId: null, ...withLine({ classId: "class-1" }) }),
        headerBody(),
        "header",
      );

      expect(result.differences).toEqual([
        { reason: "class", field: "Class", quote: "class-1", qbo: "none" },
      ]);
    });

    it("a Class on the header the quote does not have is a difference ('none' against the id)", () => {
      const result = compare(
        snapshot({ headerClassId: "class-9", ...withLine({ classId: null }) }),
        headerBody(null),
        "header",
      );

      expect(result.differences).toEqual([
        { reason: "class", field: "Class", quote: "none", qbo: "class-9" },
      ]);
    });

    it("no Class on either side is no difference", () => {
      expect(
        compare(
          snapshot({ headerClassId: null, ...withLine({ classId: null }) }),
          headerBody(null),
          "header",
        ).matches,
      ).toBe(true);
    });

    it("a wrong number of lines does not hide a header difference", () => {
      const result = compare(
        snapshot({ headerClassId: null, lines: [] }),
        headerBody("class-1"),
        "header",
      );

      expect(result.reasons).toEqual(["lines", "class"]);
    });

    it("a different Class on the line is not compared when the header is right", () => {
      const result = compare(
        snapshot({ headerClassId: "class-1", ...withLine({ classId: "class-9" }) }),
        headerBody(),
        "header",
      );

      expect(result.matches).toBe(true);
    });
  });

  describe("line", () => {
    it("a Class on the invoice's own field is ignored and the line's Class is compared", () => {
      const same = compare(snapshot({ headerClassId: "class-9" }), expected(), "line");
      const differs = compare(
        snapshot({ headerClassId: "class-1", ...withLine({ classId: "class-9" }) }),
        expected(),
        "line",
      );

      expect(same.matches).toBe(true);
      expect(differs.differences).toEqual([
        { reason: "class", field: "Class", quote: "class-1", qbo: "class-9" },
      ]);
    });
  });

  describe("none", () => {
    it.each([
      ["a Class on the line", snapshot({ headerClassId: null })],
      [
        "a Class on the header",
        snapshot({ headerClassId: "class-9", ...withLine({ classId: null }) }),
      ],
      ["a Class on both", snapshot({ headerClassId: "class-9" })],
      ["no Class", snapshot({ headerClassId: null, ...withLine({ classId: null }) })],
    ])("QuickBooks holding %s is no difference", (_label, actual) => {
      expect(compare(actual, headerBody(null), "none").reasons).not.toContain("class");
      expect(compare(actual, headerBody(null), "none").matches).toBe(true);
    });

    it("the other fields are still compared", () => {
      const result = compare(snapshot({ memo: "something else" }), headerBody(null), "none");

      expect(result.reasons).toEqual(["memo"]);
    });
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
        ship: { street: "2 Main St", city: "Easley", state: "SC", zip: "29631", other: [] },
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
    const result = compare(snapshot({ memo: "other", totalCents: 802501, taxCents: 52501 }));

    expect(result.reasons).toEqual(["memo", "totals"]);
  });
});

// An accountant opens the invoice in QuickBooks and presses Save without editing anything. QuickBooks
// keeps the street in Line1 and moves the city, province and postal code into free-text lines; the
// separate City / State / ZIP fields come back empty. The address is read as text from every part.
describe("compareInvoice — an invoice QuickBooks saved in its own screen", () => {
  /** The builder's body for a Canadian venue, the province as the quote stores it: the full name. */
  const canadianBody = (): QboInvoiceBody => {
    const body = expected();
    body.ShipAddr = {
      Line1: "145 Pacific Avenue",
      City: "Winnipeg",
      CountrySubDivisionCode: "Manitoba",
      PostalCode: "R3B 2Z6",
    };
    return body;
  };

  /** The address as QuickBooks holds it after a Save: the street, then the rest as text. */
  const saved = (...other: string[]) =>
    snapshot({
      ship: { street: "145 Pacific Avenue", city: "", state: "", zip: "", other },
    });

  it.each([
    ["the province as a code", ["Winnipeg MB R3B 2Z6"]],
    ["the province as a name", ["Winnipeg, Manitoba R3B 2Z6"]],
    ["the postal code without its space", ["Winnipeg, MB R3B2Z6"]],
    ["the country on its own line", ["Winnipeg MB R3B 2Z6", "Canada"]],
    ["the city and the rest on separate lines", ["Winnipeg", "MB R3B 2Z6"]],
  ])("matches when the rest of the address is text: %s", (_label, other) => {
    expect(compare(saved(...other), canadianBody())).toEqual({
      matches: true,
      reasons: [],
      differences: [],
    });
  });

  it("matches a US address whose state QuickBooks writes as a code while the quote has the name", () => {
    const body = expected();
    body.ShipAddr.CountrySubDivisionCode = "South Carolina";
    const actual = snapshot({
      ship: { street: "1 Main St", city: "", state: "", zip: "", other: ["Clemson SC 29631"] },
    });

    expect(compare(actual, body).matches).toBe(true);
  });

  it("matches a US address whose state QuickBooks writes as a name while the quote has the code", () => {
    const actual = snapshot({
      ship: {
        street: "1 Main St",
        city: "",
        state: "",
        zip: "",
        other: ["Clemson, South Carolina 29631-1234"],
      },
    });

    expect(compare(actual).matches).toBe(true);
  });

  it("matches when the street line also carries a unit", () => {
    const actual = snapshot({
      ship: { street: "1 Main St, Suite 5", city: "Clemson", state: "SC", zip: "29631", other: [] },
    });

    expect(compare(actual).matches).toBe(true);
  });

  it("a city that is not in the text is a difference, shown with the address QuickBooks holds", () => {
    const result = compare(saved("Brandon MB R3B 2Z6"), canadianBody());

    expect(result.reasons).toEqual(["address"]);
    expect(result.differences).toEqual([
      {
        reason: "address",
        field: "City",
        quote: "Winnipeg",
        qbo: "145 Pacific Avenue, Brandon MB R3B 2Z6",
      },
    ]);
  });

  it("a province that is not in the text is a difference", () => {
    const result = compare(saved("Winnipeg ON R3B 2Z6"), canadianBody());

    expect(result.differences.map((d) => d.field)).toEqual(["State"]);
  });

  it("a postal code that is not in the text is a difference", () => {
    const result = compare(saved("Winnipeg MB R3B 2Z7"), canadianBody());

    expect(result.differences.map((d) => d.field)).toEqual(["ZIP code"]);
  });

  it("a street that is not in the text is a difference", () => {
    const actual = snapshot({
      ship: {
        street: "146 Pacific Avenue",
        city: "",
        state: "",
        zip: "",
        other: ["Winnipeg MB R3B 2Z6"],
      },
    });

    expect(compare(actual, canadianBody()).differences.map((d) => d.field)).toEqual(["Street"]);
  });

  it("an address with nothing in it differs in every part, each shown as empty", () => {
    const empty = snapshot({
      ship: { street: "", city: "", state: "", zip: "", other: [] },
    });

    expect(compare(empty, canadianBody()).differences).toEqual([
      { reason: "address", field: "Street", quote: "145 Pacific Avenue", qbo: "" },
      { reason: "address", field: "City", quote: "Winnipeg", qbo: "" },
      { reason: "address", field: "State", quote: "Manitoba", qbo: "" },
      { reason: "address", field: "ZIP code", quote: "R3B 2Z6", qbo: "" },
    ]);
  });

  it("a part the quote has no value for is not looked for", () => {
    const body = canadianBody();
    body.ShipAddr.City = "";
    body.ShipAddr.PostalCode = "";

    expect(compare(saved("MB"), body).matches).toBe(true);
  });

  it("the other parts of the invoice are still compared", () => {
    const result = compare({ ...saved("Winnipeg MB R3B 2Z6"), memo: "other" }, canadianBody());

    expect(result.reasons).toEqual(["memo"]);
  });
});
