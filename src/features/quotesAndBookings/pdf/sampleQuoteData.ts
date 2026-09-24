import type { QuoteDocumentData } from "./quoteDocumentData";

/**
 * A made-up quote wearing the sales office being edited, so the office form can show the
 * customer's whole Approved Quote tab while someone types. Never persisted or sent anywhere.
 */
export function buildSampleQuoteData(office: {
  name: string;
  street: string;
  zip: string;
  paymentInfo: string;
}): QuoteDocumentData {
  return {
    eventId: "sample",
    quoteNumber: "123456789",
    quoteDate: "2026-01-05",
    validUntil: "2026-02-05",
    status: "quoted",
    currency: "USD",
    language: "en",
    company: {
      name: office.name.trim() || "Office name",
      street: office.street,
      city: "",
      state: "",
      zip: office.zip,
      phone: "555-0100",
      email: "office@bleacherrentals.com",
      website: "www.BleacherRentals.com",
      paymentInfo: office.paymentInfo.trim() || null,
    },
    contact: { name: "Sample Customer", email: "customer@example.com", phone: "555-0199" },
    customerCompany: null,
    poNumber: null,
    venue: {
      name: "Sample Event",
      street: "500 Main Street",
      city: "Tampa",
      state: "FL",
      zip: "33602",
    },
    dates: { eventStart: "2026-03-14", eventEnd: "2026-03-15" },
    lineItems: [
      {
        label: "Bleacher 15 row",
        description: "Delivered and set up",
        qty: 2,
        unitPrice: 50000,
        total: 100000,
      },
    ],
    subtotalCents: 100000,
    discountsCents: 0,
    taxPercent: 0,
    taxAmountCents: 0,
    totalCents: 100000,
    paymentSchedule: [
      { id: "s1", dueDate: "2026-01-10", amountCents: 50000, status: "unpaid", allocatedCents: 0 },
      { id: "s2", dueDate: "2026-03-07", amountCents: 50000, status: "unpaid", allocatedCents: 0 },
    ],
    clientNotes: "",
    internalNotes: "",
    publicUrl: "https://app.example.com/quote/sample",
    accountManager: "Sample Account Manager",
    accountManagerEmail: null,
    termsAndConditionsUuid: null,
    termsHtml: null,
    contractSignature: null,
    contentHash: "sample",
    contractHash: "sample",
  };
}
