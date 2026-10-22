import type { normalizeCanadianProvince } from "@/features/quotesAndBookings/utils/canadianTaxRates";
import type { BilledContact } from "../customers";

/**
 * The quote as the QuickBooks invoice needs it, and the invoice body built from it.
 * Spec: docs/specs/qbo-invoice-03-payload.md
 */

// `ProvinceCode` is not exported by canadianTaxRates; this is the same union.
type ProvinceCode = NonNullable<ReturnType<typeof normalizeCanadianProvince>>;

export type InvoiceSource = {
  eventId: string;
  eventStatus: string | null;
  deleted: boolean;
  invoiceNumber: number | null;
  title: string;
  eventTypeName: string | null;
  /** YYYY-MM-DD */
  eventStart: string;
  /** YYYY-MM-DD */
  dueDate: string;
  venue: { street: string; city: string; state: string; zip: string };
  billedContact: BilledContact | null;
  billToName: string;
  amountCents: number;
  taxCents: number;
  currency: "USD" | "CAD";
  /** A province code, or null for any other state. */
  canadianProvince: ProvinceCode | null;
  salesOfficeId: string | null;
  /** The sales office's QuickBooks connection. */
  connectionId: string | null;
  qboInvoiceId: string | null;
  qboInvoiceConnectionId: string | null;
  qboInvoiceHash: string | null;
  qboInvoiceSentHash: string | null;
  qboInvoiceMismatch: boolean;
};

export type InvoiceIssueCode =
  | "deleted"
  | "no_invoice_number"
  | "no_event_type"
  | "no_sales_office"
  | "no_connection"
  | "no_contact"
  | "no_venue";

export type InvoiceIssue = { code: InvoiceIssueCode; message: string };

export type QboItemRef = { id: string; name: string; description: string | null };

/** What the builder is given besides the quote. */
export type InvoiceRefs = {
  item: QboItemRef;
  customerId: string;
  /** Spec 03b; null when the quote has no Class. */
  classId: string | null;
  /** Spec 03a; null when the province has no code mapped. */
  canadianTaxCodeId: string | null;
};

export type InvoiceBuildWarning = { code: "tax_code_missing"; province: ProvinceCode };

export type QboInvoiceLine = {
  DetailType: "SalesItemLineDetail";
  Amount: string;
  Description?: string;
  SalesItemLineDetail: {
    ItemRef: { value: string; name: string };
    Qty: 1;
    UnitPrice: string;
    TaxCodeRef: { value: "TAX" | "NON" };
    ClassRef?: { value: string };
  };
};

export type QboInvoiceBody = {
  DocNumber: string;
  TxnDate: string;
  DueDate: string;
  CustomerRef: { value: string };
  BillAddr: { Line1: string };
  ShipAddr: { Line1: string; City: string; CountrySubDivisionCode: string; PostalCode: string };
  PrivateNote: string;
  GlobalTaxCalculation: "TaxExcluded";
  Line: [QboInvoiceLine];
  TxnTaxDetail?: { TxnTaxCodeRef: { value: string } };
};
