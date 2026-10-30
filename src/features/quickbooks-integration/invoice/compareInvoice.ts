import { INVOICE_REASONS } from "./invoiceTypes";
import type {
  InvoiceCheck,
  InvoiceDifference,
  InvoiceReason,
  QboInvoiceBody,
  QboInvoiceSnapshot,
} from "./invoiceTypes";

/**
 * The comparison of the invoice we would write from the quote today (the builder's body) with the
 * invoice QuickBooks holds. Pure. Zero tolerance on money.
 * Spec: docs/specs/qbo-invoice-06-totals-check.md §3, §4
 */

/** QuickBooks' decimal, a number or a string, as whole cents. */
export function dollarsToCents(value: number | string): number {
  const dollars = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(dollars)) {
    throw new Error(`QuickBooks sent an amount that is not a number: ${JSON.stringify(value)}`);
  }
  // Rounding takes the float noise out of the cents (19.99 * 100 is 1998.9999999999998).
  return Math.round(dollars * 100);
}

/** `dollarsToCents`, or null for a value that is absent or not an amount. */
export function dollarsToCentsOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  try {
    return dollarsToCents(value);
  } catch {
    return null;
  }
}

const text = (value: string | null | undefined) => (value ?? "").trim();
const day = (value: string | null | undefined) => text(value).slice(0, 10);

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number | null) =>
  cents === null ? "unreadable" : moneyFormat.format(cents / 100);

const NOT_LINKED = "not linked yet";

/** The invoice's difference from the quote, field by field; `matches` when there is none. */
export function compareInvoice(input: {
  /** The body `buildInvoicePayload` makes from the quote; its customer is "" when none is linked. */
  expected: QboInvoiceBody;
  /** The quote's total (the amount after discounts plus the tax) and its tax, in cents. */
  quote: { totalCents: number; taxCents: number };
  actual: QboInvoiceSnapshot;
}): InvoiceCheck {
  const { expected, quote, actual } = input;
  const found: InvoiceDifference[] = [];
  const add = (reason: InvoiceReason, field: string, quoteValue: string, qboValue: string) =>
    found.push({ reason, field, quote: quoteValue, qbo: qboValue });
  const compareText = (
    reason: InvoiceReason,
    field: string,
    quoteValue: string | null | undefined,
    qboValue: string | null | undefined,
  ) => {
    if (text(quoteValue) !== text(qboValue)) add(reason, field, text(quoteValue), text(qboValue));
  };

  compareText("number", "Invoice number", expected.DocNumber, actual.docNumber);

  if (day(expected.TxnDate) !== day(actual.txnDate)) {
    add("dates", "Invoice date", day(expected.TxnDate), day(actual.txnDate));
  }
  if (day(expected.DueDate) !== day(actual.dueDate)) {
    add("dates", "Due date", day(expected.DueDate), day(actual.dueDate));
  }

  const expectedCustomer = text(expected.CustomerRef.value);
  if (expectedCustomer === "" || expectedCustomer !== text(actual.customerId)) {
    add("customer", "Customer", expectedCustomer || NOT_LINKED, text(actual.customerId));
  }
  compareText("customer", "Bill to", expected.BillAddr.Line1, actual.billToLine1);

  compareText("address", "Street", expected.ShipAddr.Line1, actual.ship.street);
  compareText("address", "City", expected.ShipAddr.City, actual.ship.city);
  compareText("address", "State", expected.ShipAddr.CountrySubDivisionCode, actual.ship.state);
  compareText("address", "ZIP code", expected.ShipAddr.PostalCode, actual.ship.zip);

  compareText("memo", "Memo", expected.PrivateNote, actual.memo);

  const expectedLine = expected.Line[0];
  if (actual.lines.length !== 1) {
    add("lines", "Number of lines", "1", String(actual.lines.length));
  } else {
    const line = actual.lines[0];
    const detail = expectedLine.SalesItemLineDetail;

    compareText("service", "Service", detail.ItemRef.value, line.itemId);
    compareText("service", "Description", expectedLine.Description, line.description);

    const expectedAmount = dollarsToCents(expectedLine.Amount);
    if (line.amountCents !== expectedAmount) {
      add("amount", "Amount", money(expectedAmount), money(line.amountCents));
    }

    compareText("tax_code", "Tax code", detail.TaxCodeRef.value, line.taxCodeId);

    const expectedClass = text(detail.ClassRef?.value);
    const actualClass = text(line.classId);
    if (expectedClass !== actualClass) {
      add("class", "Class", expectedClass || "none", actualClass || "none");
    }
  }

  // QuickBooks' own total and tax say what the lines above do not: that its calculation agrees with
  // the quote's. A wrong amount, tax code or line count already makes them differ, so they are
  // reported only when those are right. The total is compared before tax and the tax on its own: a
  // tax QuickBooks did not save is then one difference (the tax), not two (the tax, and a total
  // that is off by the same amount).
  const moneyLinesDiffer = found.some(
    (d) => d.reason === "amount" || d.reason === "tax_code" || d.reason === "lines",
  );
  if (!moneyLinesDiffer) {
    const quoteBeforeTax = quote.totalCents - quote.taxCents;
    const qboBeforeTax =
      actual.totalCents === null || actual.taxCents === null
        ? null
        : actual.totalCents - actual.taxCents;
    if (qboBeforeTax !== quoteBeforeTax) {
      add("totals", "Total before tax", money(quoteBeforeTax), money(qboBeforeTax));
    }
    if (actual.taxCents !== quote.taxCents) {
      add("totals", "Tax", money(quote.taxCents), money(actual.taxCents));
    }
  }

  const reasons = INVOICE_REASONS.filter((reason) => found.some((d) => d.reason === reason));
  return { matches: reasons.length === 0, reasons, differences: found };
}
