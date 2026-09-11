import { db, powerSyncDb } from "@/components/providers/SystemProvider";

export type QuoteDetail = {
  id: string;
  invoiceNumber: number | null;
  eventName: string;
  eventStatus: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  setupStart: string | null;
  teardownEnd: string | null;
  notes: string | null;
  internalNotes: string | null;
  externalNotes: string | null;
  contractRevenueCents: number | null;
  eventTypeUuid: string | null;
  quoteValidTill: string | null;
  salesOfficeUuid: string | null;
  termsAndConditionsUuid: string | null;
  taxPercent: number | null;
  taxAmountCents: number | null;
  bookedAt: string | null;
  createdAt: string;
  createdByUserUuid: string | null;
  address: {
    street: string;
    city: string;
    stateProvince: string;
    zipPostal: string | null;
  } | null;
  venue: {
    id: string;
    name: string;
  } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  financeContact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  accountManager: {
    firstName: string | null;
    lastName: string | null;
  } | null;
  deleted: boolean;
};

type Row = {
  id: string;
  invoice_number: number | null;
  event_name: string;
  event_status: string | null;
  event_start: string | null;
  event_end: string | null;
  setup_start: string | null;
  teardown_end: string | null;
  notes: string | null;
  internal_notes: string | null;
  external_notes: string | null;
  contract_revenue_cents: number | null;
  event_type_uuid: string | null;
  quote_valid_till: string | null;
  sales_office_uuid: string | null;
  terms_and_conditions_uuid: string | null;
  tax_percent: number | null;
  tax_amount_cents: number | null;
  booked_at: string | null;
  created_at: string;
  created_by_user_uuid: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state_province: string | null;
  address_zip_postal: string | null;
  venue_id: string | null;
  venue_name: string | null;
  contact_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  fc_id: string | null;
  fc_first_name: string | null;
  fc_last_name: string | null;
  fc_email: string | null;
  fc_phone: string | null;
  am_first_name: string | null;
  am_last_name: string | null;
  deleted: number | null;
};

export async function fetchQuoteDetail(eventId: string): Promise<QuoteDetail | null> {
  const compiled = db
    .selectFrom("Events as e")
    .leftJoin("Addresses as a", "e.address_uuid", "a.id")
    .leftJoin("Venues as v", "e.venue_uuid", "v.id")
    .leftJoin("Contacts as ct", "e.contact_uuid", "ct.id")
    .leftJoin("Contacts as fc", "e.finance_contact_uuid", "fc.id")
    .leftJoin("Users as u", "e.created_by_user_uuid", "u.id")
    .select([
      "e.id as id",
      "e.invoice_number as invoice_number",
      "e.event_name as event_name",
      "e.event_status as event_status",
      "e.event_start as event_start",
      "e.event_end as event_end",
      "e.setup_start as setup_start",
      "e.teardown_end as teardown_end",
      "e.notes as notes",
      "e.internal_notes as internal_notes",
      "e.external_notes as external_notes",
      "e.contract_revenue_cents as contract_revenue_cents",
      "e.event_type_uuid as event_type_uuid",
      "e.quote_valid_till as quote_valid_till",
      "e.sales_office_uuid as sales_office_uuid",
      "e.terms_and_conditions_uuid as terms_and_conditions_uuid",
      "e.tax_percent as tax_percent",
      "e.tax_amount_cents as tax_amount_cents",
      "e.booked_at as booked_at",
      "e.created_at as created_at",
      "e.created_by_user_uuid as created_by_user_uuid",
      "a.street as address_street",
      "a.city as address_city",
      "a.state_province as address_state_province",
      "a.zip_postal as address_zip_postal",
      "v.id as venue_id",
      "v.name as venue_name",
      "ct.id as contact_id",
      "ct.first_name as contact_first_name",
      "ct.last_name as contact_last_name",
      "ct.email as contact_email",
      "ct.phone as contact_phone",
      "fc.id as fc_id",
      "fc.first_name as fc_first_name",
      "fc.last_name as fc_last_name",
      "fc.email as fc_email",
      "fc.phone as fc_phone",
      "u.first_name as am_first_name",
      "u.last_name as am_last_name",
      "e.deleted as deleted",
    ])
    .where("e.id", "=", eventId)
    .compile();

  const rows = await powerSyncDb.getAll<Row>(compiled.sql, compiled.parameters as any[]);

  if (rows.length === 0) return null;

  const r = rows[0];

  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    eventName: r.event_name,
    eventStatus: r.event_status,
    eventStart: r.event_start,
    eventEnd: r.event_end,
    setupStart: r.setup_start,
    teardownEnd: r.teardown_end,
    notes: r.notes,
    internalNotes: r.internal_notes,
    externalNotes: r.external_notes,
    contractRevenueCents: r.contract_revenue_cents,
    eventTypeUuid: r.event_type_uuid,
    quoteValidTill: r.quote_valid_till,
    salesOfficeUuid: r.sales_office_uuid,
    termsAndConditionsUuid: r.terms_and_conditions_uuid,
    taxPercent: r.tax_percent,
    taxAmountCents: r.tax_amount_cents,
    bookedAt: r.booked_at,
    createdAt: r.created_at,
    createdByUserUuid: r.created_by_user_uuid,
    address: r.address_street
      ? {
          street: r.address_street,
          city: r.address_city ?? "",
          stateProvince: r.address_state_province ?? "",
          zipPostal: r.address_zip_postal,
        }
      : null,
    venue: r.venue_id ? { id: r.venue_id, name: r.venue_name ?? "" } : null,
    contact: r.contact_id
      ? {
          id: r.contact_id,
          firstName: r.contact_first_name ?? "",
          lastName: r.contact_last_name,
          email: r.contact_email,
          phone: r.contact_phone,
        }
      : null,
    financeContact: r.fc_id
      ? {
          id: r.fc_id,
          firstName: r.fc_first_name ?? "",
          lastName: r.fc_last_name,
          email: r.fc_email,
          phone: r.fc_phone,
        }
      : null,
    accountManager:
      r.am_first_name || r.am_last_name
        ? { firstName: r.am_first_name, lastName: r.am_last_name }
        : null,
    deleted: r.deleted === 1,
  };
}
