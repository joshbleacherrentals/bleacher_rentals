import { describe, expect, it } from "vitest";
import { buildInvoicePayload } from "./buildInvoicePayload";
import { compareInvoice } from "./compareInvoice";
import { INVOICE_REASONS } from "./invoiceTypes";
import type { InvoiceReason, InvoiceRefs, InvoiceSource, QboInvoiceSnapshot } from "./invoiceTypes";

/**
 * Spec 06 §10: the invoice check says "different" only for what it compares. Every member the
 * builder writes into the body is mapped here to the reason that covers it. Writing a member that is
 * not on this list fails the test: add it to the comparison first (compareInvoice.ts), then here.
 * (It replaces invoiceHashParity.test.ts, which did the same for the hash.)
 */
const COVERED_BY: Record<string, InvoiceReason> = {
  DocNumber: "number",
  TxnDate: "dates",
  DueDate: "dates",
  "CustomerRef.value": "customer",
  "BillAddr.Line1": "customer",
  "ShipAddr.Line1": "address",
  "ShipAddr.City": "address",
  "ShipAddr.CountrySubDivisionCode": "address",
  "ShipAddr.PostalCode": "address",
  PrivateNote: "memo",
  // Not read on its own: TaxExcluded is what makes QuickBooks' total and tax what the quote says.
  GlobalTaxCalculation: "totals",
  // What makes a line a sales-item line, so what `lines` counts.
  "Line[0].DetailType": "lines",
  "Line[0].Amount": "amount",
  "Line[0].Description": "service",
  "Line[0].SalesItemLineDetail.ItemRef.value": "service",
  // The name follows the id; QuickBooks fills it in.
  "Line[0].SalesItemLineDetail.ItemRef.name": "service",
  // QuickBooks makes Amount of Qty and UnitPrice, so a change to either is a change of Amount.
  "Line[0].SalesItemLineDetail.Qty": "amount",
  "Line[0].SalesItemLineDetail.UnitPrice": "amount",
  "Line[0].SalesItemLineDetail.TaxCodeRef.value": "tax_code",
  "Line[0].SalesItemLineDetail.ClassRef.value": "class",
};

/** The members written directly: changing the invoice's own value for one must show as its reason. */
const CHANGED_IN_QUICKBOOKS: Record<string, (s: QboInvoiceSnapshot) => QboInvoiceSnapshot> = {
  DocNumber: (s) => ({ ...s, docNumber: "other" }),
  TxnDate: (s) => ({ ...s, txnDate: "2030-01-01" }),
  DueDate: (s) => ({ ...s, dueDate: "2030-01-01" }),
  "CustomerRef.value": (s) => ({ ...s, customerId: "other" }),
  "BillAddr.Line1": (s) => ({ ...s, billToLine1: "other" }),
  "ShipAddr.Line1": (s) => ({ ...s, ship: { ...s.ship, street: "other" } }),
  "ShipAddr.City": (s) => ({ ...s, ship: { ...s.ship, city: "other" } }),
  "ShipAddr.CountrySubDivisionCode": (s) => ({ ...s, ship: { ...s.ship, state: "other" } }),
  "ShipAddr.PostalCode": (s) => ({ ...s, ship: { ...s.ship, zip: "other" } }),
  PrivateNote: (s) => ({ ...s, memo: "other" }),
  "Line[0].Amount": (s) => ({ ...s, lines: [{ ...s.lines[0], amountCents: 1 }] }),
  "Line[0].Description": (s) => ({ ...s, lines: [{ ...s.lines[0], description: "other" }] }),
  "Line[0].SalesItemLineDetail.ItemRef.value": (s) => ({
    ...s,
    lines: [{ ...s.lines[0], itemId: "other" }],
  }),
  "Line[0].SalesItemLineDetail.TaxCodeRef.value": (s) => ({
    ...s,
    lines: [{ ...s.lines[0], taxCodeId: "other" }],
  }),
  "Line[0].SalesItemLineDetail.ClassRef.value": (s) => ({
    ...s,
    lines: [{ ...s.lines[0], classId: "other" }],
  }),
};

const source = (over: Partial<InvoiceSource> = {}): InvoiceSource => ({
  eventId: "event-1",
  eventStatus: "booked",
  deleted: false,
  invoiceNumber: 100200300,
  title: "SC - CLEMSON - RALLY",
  eventTypeName: "Corporate",
  eventStart: "2026-11-01",
  dueDate: "2026-10-15",
  venue: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29631" },
  billedContact: { id: "c-1", firstName: "Pat", lastName: "Lee", email: null, companyName: null },
  billToName: "Pat Lee",
  amountCents: 750000,
  taxCents: 52500,
  currency: "USD",
  canadianProvince: null,
  salesOfficeId: "office-1",
  connectionId: "conn-1",
  qboInvoiceId: "inv-1",
  qboInvoiceMismatch: false,
  qboInvoiceMismatchReasons: null,
  ...over,
});

const refs: InvoiceRefs = {
  item: { id: "item-1", name: "Bleacher Rental - Corporate", description: "Seats" },
  customerId: "cust-1",
  classId: "class-1",
  canadianTaxCodeId: "5",
  noTaxCodeId: "2",
};

/** Every path to a leaf of the body, arrays as `[0]`. */
function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => paths(v, `${prefix}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

/** QuickBooks holding exactly the body, with the tax it calculated. */
function snapshotOfBody(body: ReturnType<typeof buildInvoicePayload>["body"]): QboInvoiceSnapshot {
  const line = body.Line[0];
  return {
    docNumber: body.DocNumber,
    txnDate: body.TxnDate,
    dueDate: body.DueDate,
    customerId: body.CustomerRef.value,
    billToLine1: body.BillAddr.Line1,
    ship: {
      street: body.ShipAddr.Line1,
      city: body.ShipAddr.City,
      state: body.ShipAddr.CountrySubDivisionCode,
      zip: body.ShipAddr.PostalCode,
    },
    memo: body.PrivateNote,
    lines: [
      {
        amountCents: 750000,
        itemId: line.SalesItemLineDetail.ItemRef.value,
        description: line.Description ?? "",
        taxCodeId: line.SalesItemLineDetail.TaxCodeRef.value,
        classId: line.SalesItemLineDetail.ClassRef?.value ?? null,
      },
    ],
    totalCents: 802500,
    taxCents: 52500,
  };
}

const canadian = source({
  canadianProvince: "ON",
  venue: { street: "1 Yonge St", city: "Toronto", state: "ON", zip: "M5E 1E5" },
  currency: "CAD",
});

describe("the comparison covers every member the builder writes", () => {
  it.each([
    ["a US quote", source()],
    ["a Canadian quote", canadian],
  ])("%s: no member of the body is missing from the list, and none is extra", (_label, src) => {
    const { body } = buildInvoicePayload(src, refs);

    expect(paths(body).sort()).toEqual(Object.keys(COVERED_BY).sort());
  });

  it("names only reasons the comparison has", () => {
    for (const reason of Object.values(COVERED_BY)) expect(INVOICE_REASONS).toContain(reason);
  });

  it.each(Object.entries(CHANGED_IN_QUICKBOOKS))(
    "a change to %s in QuickBooks shows as the reason that covers it",
    (member, change) => {
      const { body } = buildInvoicePayload(source(), refs);
      const quote = { totalCents: 802500, taxCents: 52500 };

      const same = compareInvoice({ expected: body, quote, actual: snapshotOfBody(body) });
      const changed = compareInvoice({
        expected: body,
        quote,
        actual: change(snapshotOfBody(body)),
      });

      expect(same.matches).toBe(true);
      expect(changed.reasons).toContain(COVERED_BY[member]);
    },
  );
});
