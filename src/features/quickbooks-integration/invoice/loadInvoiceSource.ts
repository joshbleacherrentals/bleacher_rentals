import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { normalizeCanadianProvince } from "@/features/quotesAndBookings/utils/canadianTaxRates";
import type { BilledContact } from "../customers";
import type { InvoiceSource } from "./invoiceTypes";

/**
 * Loads a quote as the invoice needs it. Server-only (service role).
 * The amounts, dates, venue and bill-to name come from buildQuoteDocumentData — the figures the
 * client's own quote shows — and the rest from one query per table, merged here.
 * Spec: docs/specs/qbo-invoice-03-payload.md
 */

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function readEventTypeName(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("EventTypes")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the event type: ${error.message}`);
  return data?.name ?? null;
}

async function readConnectionId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  salesOfficeId: string | null,
): Promise<string | null> {
  if (!salesOfficeId) return null;
  const { data, error } = await supabase
    .from("SalesOffices")
    .select("quickbook_uuid")
    .eq("id", salesOfficeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the sales office: ${error.message}`);
  return data?.quickbook_uuid ?? null;
}

async function readBilledContact(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  contactId: string | null,
): Promise<BilledContact | null> {
  if (!contactId) return null;
  const { data: contact, error } = await supabase
    .from("Contacts")
    .select("id, first_name, last_name, email, company_uuid")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the contact: ${error.message}`);
  if (!contact) return null;

  let companyName: string | null = null;
  if (contact.company_uuid) {
    const { data: company, error: companyError } = await supabase
      .from("Companies")
      .select("company_name")
      .eq("id", contact.company_uuid)
      .maybeSingle();
    if (companyError) throw new Error(`Failed to read the company: ${companyError.message}`);
    companyName = company?.company_name ?? null;
  }

  return {
    id: contact.id,
    firstName: contact.first_name ?? "",
    lastName: contact.last_name ?? null,
    email: contact.email ?? null,
    companyName,
  };
}

/** The quote as the invoice needs it, or null when the event does not exist. */
export async function loadInvoiceSource(
  eventId: string,
  origin: string,
): Promise<InvoiceSource | null> {
  const supabase = getSupabaseAdmin();

  const [{ data: event, error }, doc] = await Promise.all([
    supabase
      .from("Events")
      .select(
        "id, invoice_number, event_status, event_type_uuid, event_name, sales_office_uuid, contact_uuid, finance_contact_uuid, deleted, qbo_invoice_id, qbo_invoice_connection_uuid, qbo_invoice_mismatch, qbo_invoice_mismatch_reasons",
      )
      .eq("id", eventId)
      .maybeSingle(),
    buildQuoteDocumentData(eventId, origin),
  ]);
  if (error) throw new Error(`Failed to read the event: ${error.message}`);
  if (!event || !doc) return null;

  const [eventTypeName, connectionId, billedContact] = await Promise.all([
    readEventTypeName(supabase, event.event_type_uuid),
    readConnectionId(supabase, event.sales_office_uuid),
    readBilledContact(supabase, event.finance_contact_uuid ?? event.contact_uuid),
  ]);

  const dueDate = doc.paymentSchedule.reduce(
    (latest, installment) => (installment.dueDate > latest ? installment.dueDate : latest),
    "",
  );

  return {
    eventId: event.id,
    eventStatus: event.event_status,
    deleted: event.deleted,
    invoiceNumber: event.invoice_number,
    title: event.event_name,
    eventTypeName,
    eventStart: doc.dates.eventStart,
    dueDate: dueDate || doc.dates.eventStart,
    venue: {
      street: doc.venue.street,
      city: doc.venue.city,
      state: doc.venue.state,
      zip: doc.venue.zip,
    },
    billedContact,
    billToName: doc.contact?.name ?? "",
    amountCents: doc.subtotalCents + doc.discountsCents,
    taxCents: doc.taxAmountCents,
    currency: doc.currency,
    canadianProvince: normalizeCanadianProvince(doc.venue.state),
    salesOfficeId: event.sales_office_uuid,
    connectionId,
    qboInvoiceId: event.qbo_invoice_id,
    qboInvoiceConnectionId: event.qbo_invoice_connection_uuid,
    qboInvoiceMismatch: event.qbo_invoice_mismatch,
    qboInvoiceMismatchReasons: event.qbo_invoice_mismatch_reasons,
  };
}
