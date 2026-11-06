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
  /**
   * The QuickBooks Product/Service (Item) assigned to the event type in the sales office's
   * connection, on the Quote Types page; null when the quote has no type or no connection, or the
   * pair has no row (spec 12b).
   */
  qboServiceId: string | null;
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
  /** The sales office's QuickBooks connection: the file of every call, the invoice's too. */
  connectionId: string | null;
  qboInvoiceId: string | null;
  qboInvoiceMismatch: boolean;
  /** The stored JSON array of reason codes, or null (spec 01). */
  qboInvoiceMismatchReasons: string | null;
};

export type InvoiceIssueCode =
  | "deleted"
  | "no_invoice_number"
  | "no_event_type"
  | "no_service"
  | "no_sales_office"
  | "no_connection"
  | "no_contact"
  | "no_venue";

export type InvoiceIssue = { code: InvoiceIssueCode; message: string };

export type QboItemRef = { id: string; name: string; description: string | null };

/**
 * Where the company's own Class setting wants the Class (spec 03f): `line` when QuickBooks tracks
 * Classes per transaction line, `header` when it tracks them for the whole transaction (the invoice's
 * own Class field), `none` when it tracks neither.
 */
export type ClassPlacement = "line" | "header" | "none";

/** What the builder is given besides the quote. */
export type InvoiceRefs = {
  item: QboItemRef;
  customerId: string;
  /** Spec 03b; null when the quote has no Class. */
  classId: string | null;
  /** Spec 03f: read live from QuickBooks; decides where `classId` is written, or whether at all. */
  classPlacement: ClassPlacement;
  /** Spec 03a; null when the province has no code mapped. */
  canadianTaxCodeId: string | null;
  /** Spec 03c: the connection's code for a Canadian line with no tax; null when none is set. */
  noTaxCodeId: string | null;
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
    // `TAX` or `NON` in the US file; a real tax code of the file in the Canadian one (spec 03d).
    TaxCodeRef: { value: string };
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
  /** The invoice's own Class (spec 03f); set only when the company tracks Classes per transaction. */
  ClassRef?: { value: string };
  Line: [QboInvoiceLine];
};

/**
 * Why a QuickBooks invoice and its quote differ (spec 06 §4). The codes are what is stored in
 * `Events.qbo_invoice_mismatch_reasons`, in this order; each has a short text for lists and marks.
 */
export const INVOICE_REASONS = [
  "number",
  "dates",
  "customer",
  "address",
  "memo",
  "lines",
  "service",
  "amount",
  "tax_code",
  "class",
  "totals",
] as const;

export type InvoiceReason = (typeof INVOICE_REASONS)[number];

export const INVOICE_REASON_SHORT_TEXT: Record<InvoiceReason, string> = {
  number: "Invoice number does not match",
  dates: "Dates do not match",
  customer: "Customer does not match",
  address: "Location of sale does not match",
  memo: "Memo does not match",
  lines: "Invoice lines do not match",
  service: "Service does not match",
  amount: "Amount does not match",
  tax_code: "Tax code does not match",
  class: "Class does not match",
  totals: "Totals do not match",
};

/** One differing field: the reason it belongs to, its label, and the two values as text. */
export type InvoiceDifference = {
  reason: InvoiceReason;
  field: string;
  quote: string;
  qbo: string;
};

/** The result of comparing the quote with its QuickBooks invoice (spec 06). */
export type InvoiceCheck = {
  matches: boolean;
  reasons: InvoiceReason[];
  differences: InvoiceDifference[];
};

/** One sales-item line of the QuickBooks invoice, as text and whole cents. */
export type QboInvoiceLineSnapshot = {
  amountCents: number | null;
  itemId: string;
  description: string;
  taxCodeId: string;
  classId: string | null;
};

/**
 * What the comparison reads of a QuickBooks invoice (spec 06 §3): every value already as text or
 * whole cents. Only the lines of type SalesItemLineDetail are listed.
 */
export type QboInvoiceSnapshot = {
  docNumber: string;
  txnDate: string;
  dueDate: string;
  customerId: string;
  billToLine1: string;
  /**
   * The ship-to address. `other` is the address lines after the first and the country, as QuickBooks
   * holds them: an invoice saved by hand in QuickBooks has the city, province and postal code there
   * and leaves `city`, `state` and `zip` empty.
   */
  ship: { street: string; city: string; state: string; zip: string; other: string[] };
  memo: string;
  /** The invoice's own Class (spec 03f); null when it has none. The line's is in `lines`. */
  headerClassId: string | null;
  lines: QboInvoiceLineSnapshot[];
  /** Null when QuickBooks sent no total, or one that is not an amount. */
  totalCents: number | null;
  /** 0 when the invoice has no TxnTaxDetail; null when QuickBooks sent a tax that is not an amount. */
  taxCents: number | null;
};
