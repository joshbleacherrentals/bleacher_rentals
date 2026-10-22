import { describe, it, expect } from "vitest";
import { buildInvoicePayload, centsToDollars } from "./buildInvoicePayload";
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

    it("taxed with a code mapped: TxnTaxDetail carries the code", () => {
      const { body, warnings } = buildInvoicePayload(ontario(), refs({ canadianTaxCodeId: "12" }));
      expect(body.TxnTaxDetail).toEqual({ TxnTaxCodeRef: { value: "12" } });
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("TAX");
      expect(warnings).toEqual([]);
    });

    it("taxed with no code: line NON, no TxnTaxDetail, a tax_code_missing warning", () => {
      const { body, warnings } = buildInvoicePayload(ontario(), refs({ canadianTaxCodeId: null }));
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("NON");
      expect(body).not.toHaveProperty("TxnTaxDetail");
      expect(warnings).toEqual([{ code: "tax_code_missing", province: "ON" }]);
    });

    it("untaxed: no TxnTaxDetail and no warning", () => {
      const { body, warnings } = buildInvoicePayload(
        ontario({ taxCents: 0 }),
        refs({ canadianTaxCodeId: "12" }),
      );
      expect(body).not.toHaveProperty("TxnTaxDetail");
      expect(body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("NON");
      expect(warnings).toEqual([]);
    });
  });

  it("United States: never a TxnTaxDetail, even taxed and given a Canadian code", () => {
    const { body, warnings } = buildInvoicePayload(
      source({ taxCents: 50000 }),
      refs({ canadianTaxCodeId: "12" }),
    );
    expect(body).not.toHaveProperty("TxnTaxDetail");
    expect(body.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("TAX");
    expect(warnings).toEqual([]);
  });
});
