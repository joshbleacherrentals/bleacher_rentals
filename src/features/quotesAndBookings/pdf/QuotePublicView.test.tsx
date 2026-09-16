import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuotePublicView } from "./QuotePublicView";
import type { QuoteDocumentData } from "./quoteDocumentData";
import type { QuoteLanguage } from "./quoteLanguage";

// fr-CA groups thousands and precedes the dollar sign with a no-break space.
const NBSP = "\u00A0";

function quote(language: QuoteLanguage): QuoteDocumentData {
  return {
    eventId: "evt-1",
    quoteNumber: "INV-1042",
    quoteDate: "2026-01-05",
    validUntil: "2026-02-05",
    status: "quoted",
    currency: "CAD",
    language,
    company: {
      name: "Bleacher Rentals",
      street: "12 Main St",
      city: "Montreal",
      state: "QC",
      zip: "H2X 1Y4",
      phone: "555-0100",
      email: "office@bleacherrentals.com",
      website: "www.BleacherRentals.com",
    },
    contact: { name: "Marie Tremblay", email: "marie@example.com", phone: "555-0199" },
    customerCompany: null,
    poNumber: "PO-77",
    venue: {
      name: "Festival de Jazz",
      street: "500 Rue Sainte-Catherine",
      city: "Montreal",
      state: "QC",
      zip: "H3B 1B7",
    },
    dates: { eventStart: "2026-01-18", eventEnd: "2026-01-19" },
    lineItems: [
      {
        label: "Bleacher 15 row",
        description: "Delivered",
        qty: 2,
        unitPrice: 50000,
        total: 100000,
      },
    ],
    subtotalCents: 100000,
    discountsCents: -10000,
    taxPercent: 5,
    taxAmountCents: 4500,
    totalCents: 94500,
    paymentSchedule: [
      {
        id: "pi-1",
        dueDate: "2026-01-10",
        amountCents: 47250,
        status: "unpaid",
        allocatedCents: 0,
      },
      {
        id: "pi-2",
        dueDate: "2026-01-25",
        amountCents: 47250,
        status: "unpaid",
        allocatedCents: 0,
      },
    ],
    clientNotes: "Merci!",
    internalNotes: "",
    publicUrl: "https://app.example.com/quote/evt-1",
    accountManager: "Josh R",
    accountManagerEmail: "josh@example.com",
    termsAndConditionsUuid: null,
    termsHtml: null,
    contractSignature: null,
    contentHash: "hash",
    contractHash: "chash",
  };
}

const render = (language: QuoteLanguage) =>
  renderToStaticMarkup(<QuotePublicView data={quote(language)} />);

describe("QuotePublicView — English (regression guard)", () => {
  const html = render("en");

  it("renders the labels it always has", () => {
    for (const label of [
      "Event Information",
      "INVOICE",
      "Rental Items",
      "Description",
      "Subtotal",
      "Subtotal After Discount",
      "Remaining Balance",
      "Download PDF",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("renders English dates and money in the original format", () => {
    // This quote is Canadian, so every amount on it carries the C$ marker —
    // an unmarked "$1,000.00" would read as a US price a third cheaper.
    expect(html).toContain("C$1,000.00");
    expect(html).not.toMatch(/[^C]\$1,000\.00/);
    expect(html).toContain("Sunday, Jan 18 - Monday, Jan 19, 2026");
    expect(html).toContain("Tax (5%)");
    expect(html).toContain("Invoice #INV-1042");
  });

  it("tells the client where to send an e-transfer", () => {
    expect(html).toContain("e-transfers to payments@bleacherrentals.com");
  });
});

describe("QuotePublicView — customer company", () => {
  it("does not render a company block when the contact has no company", () => {
    const html = render("en");
    expect(html).not.toContain(">Company<");
  });

  it("renders the customer's company name and address when present", () => {
    const data = quote("en");
    data.customerCompany = { name: "Acme Events Inc.", address: "12 Main St, Montreal, QC" };
    const html = renderToStaticMarkup(<QuotePublicView data={data} />);
    expect(html).toContain(">Company<");
    expect(html).toContain("Acme Events Inc.");
    expect(html).toContain("12 Main St, Montreal, QC");
  });

  it("renders the company name without an address line when the address is empty", () => {
    const data = quote("en");
    data.customerCompany = { name: "Acme Events Inc.", address: "" };
    const html = renderToStaticMarkup(<QuotePublicView data={data} />);
    expect(html).toContain("Acme Events Inc.");
  });
});

describe("QuotePublicView — French", () => {
  const html = render("fr");

  it("renders the labels in French", () => {
    for (const label of [
      "Renseignements sur l&#x27;événement",
      "FACTURE",
      "Articles en location",
      "Sous-total",
      "Sous-total après rabais",
      "Solde restant",
      "Télécharger le PDF",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("renders fr-CA dates and money", () => {
    expect(html).toContain(`1${NBSP}000,00${NBSP}$${NBSP}CA`);
    expect(html).toContain("dimanche 18 janv. - lundi 19 janv. 2026");
    expect(html).toContain("Taxes (5 %)");
  });

  it("gives the e-transfer address in French", () => {
    expect(html).toContain("Virements Interac à payments@bleacherrentals.com");
  });

  it("leaves no English chrome behind", () => {
    for (const englishOnly of ["Event Information", "Rental Items", "Download PDF", "INVOICE"]) {
      expect(html).not.toContain(englishOnly);
    }
  });

  it("does not translate customer data — names, notes and the invoice number are verbatim", () => {
    expect(html).toContain("Marie Tremblay");
    expect(html).toContain("Festival de Jazz");
    expect(html).toContain("Merci!");
    expect(html).toContain("INV-1042");
  });
});
