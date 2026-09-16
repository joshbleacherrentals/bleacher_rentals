import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { resolveInvoiceDisplay, buildPublicQuoteUrl } from "../utils/invoiceNumber";
import { toQuoteLanguage, type QuoteLanguage } from "./quoteLanguage";
import { allocatePayments } from "../utils/allocatePayments";
import { resolveEventCurrency } from "../server/eventPaymentContext";

// ── The single source of truth for rendering a quote ──

export type QuoteLineItem = {
  label: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type QuotePaymentInstallment = {
  id: string;
  dueDate: string;
  amountCents: number;
  /** Derived from the money in PaymentHistory, never the stored flag. */
  status: "unpaid" | "partial" | "paid";
  /** How much of `amountCents` the payments actually cover. */
  allocatedCents: number;
};

export type QuoteDocumentData = {
  // Internal ID (for API routes)
  eventId: string;
  // Header
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  status: string;
  currency: "USD" | "CAD";
  // Language every client-facing surface renders in, resolved from the quote
  // contact's Contacts.preferred_language. The single resolution point — no
  // renderer looks it up again. See docs/specs/quote-preferred-language.md.
  language: QuoteLanguage;

  // Company (the business sending the quote — from SalesOffice)
  company: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
    website: string;
  };

  // Client contact. Resolved from Events.finance_contact_uuid when set,
  // otherwise Events.contact_uuid — see docs/specs/quote-preferred-language.md
  // sibling logic in buildQuoteDocumentData.
  contact: {
    name: string;
    email: string;
    phone: string;
  } | null;

  // The resolved contact's company (finance contact's company takes priority
  // over the regular contact's company). Null whenever that contact has no
  // Contacts.company_uuid — never rendered as an empty block.
  customerCompany: {
    name: string;
    address: string;
  } | null;

  // Purchase Order number (from client, set after payment)
  poNumber: string | null;

  // Venue / event address
  venue: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  // Dates
  dates: {
    eventStart: string;
    eventEnd: string;
  };

  // Line items
  lineItems: QuoteLineItem[];

  // Totals (all in cents)
  subtotalCents: number;
  discountsCents: number;
  taxPercent: number;
  taxAmountCents: number;
  totalCents: number;

  // Payment schedule
  paymentSchedule: QuotePaymentInstallment[];

  // Notes
  clientNotes: string;
  internalNotes: string;

  // Public link
  publicUrl: string;

  // Account manager
  accountManager: string;
  accountManagerEmail: string | null;

  // Terms & Conditions
  termsAndConditionsUuid: string | null;
  termsHtml: string | null;

  // Contract signature
  contractSignature: {
    signerName: string;
    signedAt: string;
  } | null;

  // Staleness fingerprints (trigger-maintained on Events). content_hash drives the
  // "please refresh" modal; contract_hash drives the sign-time guard / future re-sign.
  // See docs/specs/quote-staleness-detection.md.
  contentHash: string;
  contractHash: string;
};

// ── Helper ──

function formatCents(cents: number): number {
  return cents;
}

/** The shape of a Contacts row nested with its Companies/Addresses join. */
type ContactWithCompany = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_uuid?: string | null;
  Companies?: {
    company_name?: string | null;
    Addresses?: {
      street?: string | null;
      city?: string | null;
      state_province?: string | null;
      zip_postal?: string | null;
    } | null;
  } | null;
} | null;

/**
 * Some Addresses rows already store one fully composed address in `street`
 * (multiple commas) rather than split across street/city/state/zip. Appending
 * city/state/zip in that case would duplicate the address, so it's returned
 * as-is instead.
 */
export function combineAddressLine(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string {
  const streetValue = street ?? "";
  if (streetValue.split(",").length > 2) {
    return streetValue;
  }
  return [streetValue, city, state, zip].filter(Boolean).join(", ");
}

/**
 * The company to show for a quote's contact, or null when that contact has
 * no Contacts.company_uuid — a bare empty block is never rendered.
 */
export function buildCustomerCompany(
  contact: ContactWithCompany,
): QuoteDocumentData["customerCompany"] {
  if (!contact?.company_uuid) return null;

  const company = contact.Companies;
  const addr = company?.Addresses;

  return {
    name: company?.company_name ?? "",
    address: combineAddressLine(addr?.street, addr?.city, addr?.state_province, addr?.zip_postal),
  };
}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Builder: fetches everything from DB and returns one object ──

export async function buildQuoteDocumentData(
  eventId: string,
  origin?: string,
): Promise<QuoteDocumentData | null> {
  const supabase = getSupabaseAdmin();

  // 1. Fetch event with joins
  const { data: event, error } = await supabase
    .from("Events")
    .select(
      `
      id,
      invoice_number,
      po_number,
      event_name,
      event_status,
      event_start,
      event_end,
      setup_start,
      teardown_end,
      notes,
      internal_notes,
      external_notes,
      contract_revenue_cents,
      quote_valid_till,
      created_at,
      created_by_user_uuid,
      sales_office_uuid,
      terms_and_conditions_uuid,
      tax_percent,
      tax_amount_cents,
      content_hash,
      contract_hash,
      Addresses!Events_address_uuid_fkey (
        street, city, state_province, zip_postal
      ),
      Contacts!Events_contact_uuid_fkey (
        first_name, last_name, email, phone, preferred_language, company_uuid,
        Companies (
          company_name,
          Addresses!Companies_billing_address_uuid_fkey ( street, city, state_province, zip_postal )
        )
      ),
      financeContact:Contacts!Events_finance_contact_uuid_fkey (
        first_name, last_name, email, phone, company_uuid,
        Companies (
          company_name,
          Addresses!Companies_billing_address_uuid_fkey ( street, city, state_province, zip_postal )
        )
      ),
      Users!Events_created_by_user_uuid_fkey (
        first_name, last_name, email
      )
    `,
    )
    .eq("id", eventId)
    .single();

  if (error || !event) {
    console.error("buildQuoteDocumentData: failed to fetch event", error);
    return null;
  }

  const addr = event.Addresses as any;
  const contact = event.Contacts as any;
  const financeContact = (event as any).financeContact as any;
  // The finance contact — and their company — replaces the regular contact
  // wherever a quote shows "who the client is" when set.
  const effectiveContact = financeContact ?? contact;
  const user = event.Users as any;

  // Parallel fetch: salesOffice, lineItems, installments, terms, signature
  const [soResult, lineItemResult, installmentResult, paymentResult, termsResult, sigResult] =
    await Promise.all([
      // SalesOffice
      event.sales_office_uuid
        ? supabase
            .from("SalesOffices")
            .select(
              `
              name,
              phone,
              Addresses!SalesOffices_address_uuid_fkey (
                street, city, state_province, zip_postal
              )
            `,
            )
            .eq("id", event.sales_office_uuid)
            .single()
        : Promise.resolve({ data: null }),

      // Line items
      supabase
        .from("EventLineItems")
        .select("header, description, quantity, value_cents, currency")
        .eq("event_uuid", eventId)
        .eq("deleted", false)
        .order("created_at"),

      // Payment installments
      supabase
        .from("PaymentInstallments")
        .select("id, due_date, amount_cents")
        .eq("event_uuid", eventId)
        .order("due_date"),

      // Payments actually received — the source of truth for every status below.
      supabase
        .from("PaymentHistory")
        .select("id, installment_id, amount_cents, currency, status, paid_at, created_at")
        .eq("event_uuid", eventId),

      // Terms & Conditions
      (event as any).terms_and_conditions_uuid
        ? supabase
            .from("TermsAndConditions")
            .select("html_content")
            .eq("id", (event as any).terms_and_conditions_uuid)
            .single()
        : Promise.resolve({ data: null }),

      // Contract signature
      (event as any).terms_and_conditions_uuid
        ? supabase
            .from("ContractSignatures")
            .select("signer_name, signed_at")
            .eq("event_uuid", eventId)
            .eq("status", "active")
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Process SalesOffice
  let salesOffice: {
    name: string;
    phone: string | null;
    street: string;
    city: string;
    state: string;
    zip: string;
  } | null = null;
  if (soResult.data) {
    const so = soResult.data as any;
    const soAddr = so.Addresses;
    salesOffice = {
      name: so.name,
      phone: so.phone ?? null,
      street: soAddr?.street ?? "",
      city: soAddr?.city ?? "",
      state: soAddr?.state_province ?? "",
      zip: soAddr?.zip_postal ?? "",
    };
  }

  // Process line items
  const lineItemRows = lineItemResult.data;
  const lineItems: QuoteLineItem[] = (lineItemRows ?? []).map((li: any) => ({
    label: li.header,
    description: li.description ?? "",
    qty: li.quantity ?? 1,
    unitPrice: li.value_cents,
    total: (li.quantity ?? 1) * li.value_cents,
  }));

  // Process installments. The status a client reads on this document is derived
  // from the payments, not from PaymentInstallments.status — that flag is a
  // cache, and it once told a client a $3,600 installment was paid for $1.
  // See docs/specs/payment-accounting-truth.md.
  // The quote's currency comes from its sales office — the same resolution the
  // checkout endpoint charges in — so the document can never state one currency
  // while Stripe collects another. Line items only carry a copy of it.
  const scheduleCurrency = await resolveEventCurrency(supabase, event.sales_office_uuid);
  const allocation = allocatePayments(
    (installmentResult.data ?? []).map((pi: any) => ({
      id: pi.id,
      dueDate: pi.due_date ?? "",
      amountCents: pi.amount_cents ?? 0,
    })),
    ((paymentResult as any).data ?? []).map((ph: any) => ({
      id: ph.id,
      installmentId: ph.installment_id,
      amountCents: ph.amount_cents ?? 0,
      currency: ph.currency ?? "",
      status: ph.status ?? "",
      paidAt: ph.paid_at,
      createdAt: ph.created_at ?? "",
    })),
    scheduleCurrency,
  );

  const paymentSchedule: QuotePaymentInstallment[] = allocation.installments.map((i) => ({
    id: i.installmentId,
    dueDate: i.dueDate,
    amountCents: i.amountCents,
    status: i.status,
    allocatedCents: i.allocatedCents,
  }));

  // Calculate totals
  const subtotalCents = lineItems
    .filter((li) => li.total >= 0)
    .reduce((sum, li) => sum + li.total, 0);
  const discountsCents = lineItems
    .filter((li) => li.total < 0)
    .reduce((sum, li) => sum + li.total, 0);
  const taxableAmount = subtotalCents + discountsCents;
  const taxPercent = (event as any).tax_percent ?? 0;
  const taxAmountCents =
    (event as any).tax_amount_cents ?? Math.round(taxableAmount * (taxPercent / 100));
  const totalCents = taxableAmount + taxAmountCents;

  const currency = scheduleCurrency;

  const appOrigin = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bleacherrentals.com";
  const invoiceNum = resolveInvoiceDisplay(event.invoice_number, eventId);
  const publicUrl = buildPublicQuoteUrl(appOrigin, eventId);

  // Process terms & signature
  const sig = sigResult.data as any;

  return {
    eventId,
    quoteNumber: invoiceNum,
    quoteDate: event.created_at?.split("T")[0] ?? "",
    validUntil: (event as any).quote_valid_till ?? "",
    status: event.event_status ?? "draft",
    currency,
    language: toQuoteLanguage(contact?.preferred_language),

    company: {
      name: salesOffice?.name ?? "Bleacher Rentals",
      street: salesOffice?.street ?? "",
      city: salesOffice?.city ?? "",
      state: salesOffice?.state ?? "",
      zip: salesOffice?.zip ?? "",
      phone: salesOffice?.phone ?? "",
      email: "office@bleacherrentals.com",
      website: "www.BleacherRentals.com",
    },

    contact: effectiveContact
      ? {
          name: `${effectiveContact.first_name ?? ""} ${effectiveContact.last_name ?? ""}`.trim(),
          email: effectiveContact.email ?? "",
          phone: effectiveContact.phone ?? "",
        }
      : null,

    customerCompany: buildCustomerCompany(effectiveContact),

    poNumber: (event as any).po_number ?? null,

    venue: {
      name: event.event_name,
      street: addr?.street ?? "",
      city: addr?.city ?? "",
      state: addr?.state_province ?? "",
      zip: addr?.zip_postal ?? "",
    },

    dates: {
      eventStart: event.event_start ?? "",
      eventEnd: event.event_end ?? "",
    },

    lineItems,
    subtotalCents,
    discountsCents,
    taxPercent,
    taxAmountCents,
    totalCents,
    paymentSchedule,

    clientNotes: event.external_notes ?? event.notes ?? "",
    internalNotes: event.internal_notes ?? "",
    publicUrl,
    accountManager: user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : "",
    accountManagerEmail: user?.email ?? null,

    termsAndConditionsUuid: (event as any).terms_and_conditions_uuid ?? null,
    termsHtml: (termsResult.data as any)?.html_content ?? null,
    contractSignature: sig ? { signerName: sig.signer_name, signedAt: sig.signed_at } : null,

    contentHash: (event as any).content_hash ?? "",
    contractHash: (event as any).contract_hash ?? "",
  } satisfies QuoteDocumentData;
}

/**
 * Language for a quote, without building the whole document.
 *
 * Used by the payment-success page, which needs nothing else off the quote and
 * shouldn't pay for six joins and four parallel queries to render one sentence.
 * Falls back to English on any error — this page is on the customer's happy
 * path right after they paid, and must always render.
 */
export async function resolveQuoteLanguage(eventId: string): Promise<QuoteLanguage> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("Events")
      .select("Contacts!Events_contact_uuid_fkey (preferred_language)")
      .eq("id", eventId)
      .maybeSingle();
    return toQuoteLanguage((data?.Contacts as any)?.preferred_language);
  } catch {
    return "en";
  }
}
