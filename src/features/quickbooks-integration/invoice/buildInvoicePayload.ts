import type {
  InvoiceBuildWarning,
  InvoiceIssue,
  InvoiceRefs,
  InvoiceSource,
  QboInvoiceBody,
  QboInvoiceLine,
} from "./invoiceTypes";

/**
 * Pure: turns a quote (InvoiceSource) into the body of a QuickBooks invoice.
 * Every field it reads must be covered by the invoice hash — see invoiceHashParity.test.ts.
 * Spec: docs/specs/qbo-invoice-03-payload.md
 */

/** Cents as a two-decimal dollar string, by integer arithmetic (no floating point). */
export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** What stops this quote from being invoiced, each message for the person who pressed the button. */
export function validateInvoiceSource(source: InvoiceSource): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];

  if (source.deleted) {
    issues.push({
      code: "deleted",
      message: "This quote is deleted. Restore it before creating an invoice.",
    });
  }
  if (source.invoiceNumber === null) {
    issues.push({
      code: "no_invoice_number",
      message: "This quote has no invoice number, so it cannot be invoiced in QuickBooks.",
    });
  }
  if (!source.eventTypeName) {
    issues.push({
      code: "no_event_type",
      message: "Choose an event type on the quote (City, Corporate or Rural) and try again.",
    });
  }
  if (!source.salesOfficeId) {
    issues.push({
      code: "no_sales_office",
      message: "Choose a sales office on the quote and try again.",
    });
  } else if (!source.connectionId) {
    issues.push({
      code: "no_connection",
      message: "This quote's sales office has no QuickBooks connection. Ask an admin to set one.",
    });
  }

  const contact = source.billedContact;
  if (!contact || !(contact.firstName.trim() || contact.lastName?.trim())) {
    issues.push({
      code: "no_contact",
      message: "Add a contact with a name to the quote and try again.",
    });
  }
  if (!source.venue.street.trim() || !source.venue.state.trim()) {
    issues.push({
      code: "no_venue",
      message: "Add the venue's street address and state to the quote and try again.",
    });
  }

  return issues;
}

/** The invoice body and what the caller should tell the user about it. */
export function buildInvoicePayload(
  source: InvoiceSource,
  refs: InvoiceRefs,
): { body: QboInvoiceBody; warnings: InvoiceBuildWarning[] } {
  const warnings: InvoiceBuildWarning[] = [];
  const taxed = source.taxCents > 0;

  // Canada: QuickBooks applies the code it is handed. Taxed but no code mapped → no tax, warn.
  const province = source.canadianProvince;
  const canadianCode = province && taxed ? refs.canadianTaxCodeId : null;
  if (province && taxed && !canadianCode) {
    warnings.push({ code: "tax_code_missing", province });
  }
  const lineTaxed = taxed && (!province || canadianCode !== null);

  const amount = centsToDollars(source.amountCents);
  const line: QboInvoiceLine = {
    DetailType: "SalesItemLineDetail",
    Amount: amount,
    ...(refs.item.description ? { Description: refs.item.description } : {}),
    SalesItemLineDetail: {
      ItemRef: { value: refs.item.id, name: refs.item.name },
      Qty: 1,
      UnitPrice: amount,
      TaxCodeRef: { value: lineTaxed ? "TAX" : "NON" },
      ...(refs.classId ? { ClassRef: { value: refs.classId } } : {}),
    },
  };

  const body: QboInvoiceBody = {
    DocNumber: String(source.invoiceNumber),
    TxnDate: source.eventStart,
    DueDate: source.dueDate,
    CustomerRef: { value: refs.customerId },
    BillAddr: { Line1: source.billToName },
    ShipAddr: {
      Line1: source.venue.street,
      City: source.venue.city,
      CountrySubDivisionCode: source.venue.state,
      PostalCode: source.venue.zip,
    },
    PrivateNote: source.title,
    GlobalTaxCalculation: "TaxExcluded",
    Line: [line],
    ...(canadianCode ? { TxnTaxDetail: { TxnTaxCodeRef: { value: canadianCode } } } : {}),
  };

  return { body, warnings };
}
