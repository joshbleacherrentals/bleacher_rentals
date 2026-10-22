import { describe, it, expect } from "vitest";
import { buildInvoicePayload, centsToDollars, needsNoTaxCode } from "./buildInvoicePayload";
import type { InvoiceRefs, InvoiceSource } from "./invoiceTypes";

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
    email: "dabo@example.com",
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
  qboInvoiceHash: "hash",
  qboInvoiceSentHash: null,
  qboInvoiceMismatch: false,
  ...over,
});

const refs = (over: Partial<InvoiceRefs> = {}): InvoiceRefs => ({
  item: { id: "77", name: "Bleacher Rental - Corporate", description: "Temporary seating" },
  customerId: "900",
  classId: null,
  canadianTaxCodeId: null,
  noTaxCodeId: null,
  ...over,
});

const line = (s = source(), r = refs()) => buildInvoicePayload(s, r).body.Line[0];

describe("buildInvoicePayload", () => {
  it("builds the SC - CLEMSON - RALLY invoice body", () => {
    const { body, warnings } = buildInvoicePayload(source(), refs());
    expect(warnings).toEqual([]);
    expect(body).toEqual({
      DocNumber: "100200300",
      TxnDate: "2026-11-14",
      DueDate: "2026-11-01",
      CustomerRef: { value: "900" },
      BillAddr: { Line1: "Dabo Swinney" },
      ShipAddr: {
        Line1: "100 Tiger Blvd",
        City: "Clemson",
        CountrySubDivisionCode: "SC",
        PostalCode: "29634",
      },
      PrivateNote: "SC - CLEMSON - RALLY",
      GlobalTaxCalculation: "TaxExcluded",
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: "7500.00",
          Description: "Temporary seating",
          SalesItemLineDetail: {
            ItemRef: { value: "77", name: "Bleacher Rental - Corporate" },
            Qty: 1,
            UnitPrice: "7500.00",
            TaxCodeRef: { value: "NON" },
          },
        },
      ],
    });
  });

  it("has exactly one line, Qty 1", () => {
    const { body } = buildInvoicePayload(source(), refs());
    expect(body.Line).toHaveLength(1);
    expect(body.Line[0].SalesItemLineDetail.Qty).toBe(1);
  });

  it("uses the amount it is given, which is subtotal plus the negative discount", () => {
    // The loader makes amountCents = subtotalCents + discountsCents (900000 + -150000).
    expect(line(source({ amountCents: 900000 + -150000 })).Amount).toBe("7500.00");
  });

  it("turns cents into dollars exactly", () => {
    expect(centsToDollars(1)).toBe("0.01");
    expect(centsToDollars(99)).toBe("0.99");
    expect(centsToDollars(100)).toBe("1.00");
    expect(centsToDollars(10000001)).toBe("100000.01");
    expect(centsToDollars(0)).toBe("0.00");
    expect(centsToDollars(-1)).toBe("-0.01");
    expect(centsToDollars(-12345)).toBe("-123.45");
    expect(line(source({ amountCents: 10000001 })).SalesItemLineDetail.UnitPrice).toBe("100000.01");
    expect(line(source({ amountCents: 1 })).Amount).toBe("0.01");
  });

  it("builds a total of 0 as Amount 0.00", () => {
    expect(line(source({ amountCents: 0 })).Amount).toBe("0.00");
  });

  it("marks the line TAX when there is tax and NON when there is none", () => {
    expect(line(source({ taxCents: 1 })).SalesItemLineDetail.TaxCodeRef.value).toBe("TAX");
    expect(line(source({ taxCents: 0 })).SalesItemLineDetail.TaxCodeRef.value).toBe("NON");
  });

  it("uses the Item's own Description and omits it when the Item has none", () => {
    expect(line().Description).toBe("Temporary seating");
    const noDescription = line(
      source(),
      refs({ item: { id: "77", name: "Bleacher Rental - Corporate", description: null } }),
    );
    expect("Description" in noDescription).toBe(false);
  });

  it("carries the ClassRef only when a classId is given", () => {
    expect(line(source(), refs({ classId: "5" })).SalesItemLineDetail.ClassRef).toEqual({
      value: "5",
    });
    expect("ClassRef" in line().SalesItemLineDetail).toBe(false);
  });

  it("sends nothing to the client: no BillEmail, no email status", () => {
    const { body } = buildInvoicePayload(source(), refs());
    expect(body).not.toHaveProperty("BillEmail");
    expect(body).not.toHaveProperty("EmailStatus");
  });

  describe("Canada", () => {
    const ontario = (over: Partial<InvoiceSource> = {}) =>
      source({
        venue: { street: "1 Yonge St", city: "Toronto", state: "ON", zip: "M5E 1E5" },
        canadianProvince: "ON",
        currency: "CAD",
        taxCents: 97500,
        ...over,
      });

    // docs/specs/qbo-invoice-03d-canadian-line-tax-code.md §2: QuickBooks Canada refuses TAX and NON
    // on a line; the line carries a real tax code of the file, and QuickBooks builds the tax itself.
    it("taxed with a code mapped: the line carries the province's code, no TxnTaxDetail", () => {
      const { body, warnings } = buildInvoicePayload(
        ontario(),
        refs({ canadianTaxCodeId: "5", noTaxCodeId: "2" }),
      );
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "5" });
      expect(body).not.toHaveProperty("TxnTaxDetail");
      expect(warnings).toEqual([]);
    });

    it("taxed with no code: the line carries the no-tax code, no TxnTaxDetail, a tax_code_missing warning", () => {
      const { body, warnings } = buildInvoicePayload(
        ontario(),
        refs({ canadianTaxCodeId: null, noTaxCodeId: "2" }),
      );
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "2" });
      expect(body).not.toHaveProperty("TxnTaxDetail");
      expect(warnings).toEqual([{ code: "tax_code_missing", province: "ON" }]);
    });

    it("untaxed: the line carries the no-tax code, no TxnTaxDetail and no warning", () => {
      const { body, warnings } = buildInvoicePayload(
        ontario({ taxCents: 0 }),
        refs({ canadianTaxCodeId: "5", noTaxCodeId: "2" }),
      );
      expect(body).not.toHaveProperty("TxnTaxDetail");
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "2" });
      expect(warnings).toEqual([]);
    });

    it("never puts TAX or NON on a Canadian line", () => {
      const values = [
        buildInvoicePayload(ontario(), refs({ canadianTaxCodeId: "5", noTaxCodeId: "2" })),
        buildInvoicePayload(ontario(), refs({ noTaxCodeId: "2" })),
        buildInvoicePayload(ontario({ taxCents: 0 }), refs({ noTaxCodeId: "2" })),
      ].map(({ body }) => body.Line[0].SalesItemLineDetail.TaxCodeRef.value);
      expect(values).not.toContain("TAX");
      expect(values).not.toContain("NON");
    });

    it("needs the no-tax code when untaxed, or taxed with no province code, and throws without it", () => {
      expect(() => buildInvoicePayload(ontario({ taxCents: 0 }), refs())).toThrow(/no-tax code/);
      expect(() => buildInvoicePayload(ontario(), refs({ canadianTaxCodeId: null }))).toThrow(
        /no-tax code/,
      );
    });

    it("does not need the no-tax code when taxed with the province's code", () => {
      expect(() =>
        buildInvoicePayload(ontario(), refs({ canadianTaxCodeId: "5", noTaxCodeId: null })),
      ).not.toThrow();
    });
  });

  describe("needsNoTaxCode", () => {
    const ontario = (over: Partial<InvoiceSource> = {}) =>
      source({ canadianProvince: "ON", taxCents: 97500, ...over });

    it("is true for an untaxed Canadian quote, and for a taxed one with no province code", () => {
      expect(needsNoTaxCode(ontario({ taxCents: 0 }), "5")).toBe(true);
      expect(needsNoTaxCode(ontario(), null)).toBe(true);
    });

    it("is false for a taxed Canadian quote with its province code, and for any US quote", () => {
      expect(needsNoTaxCode(ontario(), "5")).toBe(false);
      expect(needsNoTaxCode(source({ taxCents: 0 }), null)).toBe(false);
      expect(needsNoTaxCode(source({ taxCents: 50000 }), null)).toBe(false);
    });
  });

  it("United States: still TAX or NON, never a TxnTaxDetail, even given Canadian codes", () => {
    const given = refs({ canadianTaxCodeId: "5", noTaxCodeId: "2" });

    const taxed = buildInvoicePayload(source({ taxCents: 50000 }), given);
    expect(taxed.body).not.toHaveProperty("TxnTaxDetail");
    expect(taxed.body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "TAX" });
    expect(taxed.warnings).toEqual([]);

    const untaxed = buildInvoicePayload(source({ taxCents: 0 }), given);
    expect(untaxed.body.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: "NON" });
  });
});
