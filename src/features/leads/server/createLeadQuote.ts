import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../../database.types";
import type { ParsedLead } from "../logic/parseWpformsLead";
import { findOrCreateVenue } from "./findOrCreateVenue";

type AdminClient = SupabaseClient<Database>;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Escapes `%`, `_` and `\` so an email is matched as written by `ilike`. */
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findOrCreateContact(
  supabase: AdminClient,
  lead: ParsedLead,
): Promise<string | null> {
  if (!lead.firstName && !lead.lastName && !lead.email && !lead.phone) return null;

  if (lead.email) {
    const { data: existing } = await supabase
      .from("Contacts")
      .select("id")
      .ilike("email", likeLiteral(lead.email))
      .eq("deleted", false)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;
  }

  const { data, error } = await supabase
    .from("Contacts")
    .insert({
      // first_name is required; a lead with no name is filed under its email or phone.
      first_name: lead.firstName ?? lead.email ?? lead.phone ?? "Website Lead",
      last_name: lead.lastName,
      email: lead.email,
      phone: lead.phone,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the contact: ${error.message}`);
  return data.id;
}

async function createAddress(supabase: AdminClient, lead: ParsedLead): Promise<string | null> {
  if (!lead.street && !lead.city && !lead.stateProvince && !lead.zipPostal) return null;

  const { data, error } = await supabase
    .from("Addresses")
    .insert({
      street: lead.street,
      city: lead.city,
      state_province: lead.stateProvince,
      zip_postal: lead.zipPostal,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the address: ${error.message}`);
  return data.id;
}

/**
 * Creates a quote (an `Events` row with status `draft`, shown as "New") from a website lead.
 * Nothing but the dates and the name is required by the table, so a nearly blank lead still makes
 * a quote: the name falls back to "Website Lead" and a missing date to today, for the account
 * manager to fix. The contact is reused when the email is already known, and so is the venue when
 * its address is. The owner is `ownerUserUuid`
 * (the quote is unassigned when it is null). The submission is kept as received, for the quote's
 * Submission tab. The invoice number comes from the same database
 * function the app's own create flow uses.
 */
export async function createLeadQuote(
  supabase: AdminClient,
  lead: ParsedLead,
  ownerUserUuid: string | null,
  submission: Record<string, unknown> | null = null,
): Promise<string> {
  const contactId = await findOrCreateContact(supabase, lead);
  // A lead with a street belongs to the venue at that address. The database then copies the
  // venue's address onto the quote (events_sync_address_from_venue), so the quote needs no address
  // row of its own; a lead without a street keeps a private one.
  const venueId = await findOrCreateVenue(supabase, lead);
  const addressId = venueId ? null : await createAddress(supabase, lead);

  const eventStart = lead.startDate ?? lead.endDate ?? todayIso();
  const eventEnd = lead.endDate && lead.endDate >= eventStart ? lead.endDate : eventStart;

  const { data: event, error } = await supabase
    .from("Events")
    .insert({
      event_name: lead.eventName ?? "Website Lead",
      event_start: eventStart,
      event_end: eventEnd,
      event_status: "draft",
      lenient: false,
      must_be_clean: false,
      deleted: false,
      total_seats: lead.seats,
      address_uuid: addressId,
      venue_uuid: venueId,
      contact_uuid: contactId,
      created_by_user_uuid: ownerUserUuid,
      internal_notes: lead.internalNotes,
      lead_submission: (submission as Json | null) ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the quote: ${error.message}`);

  // Same step as the app's create flow. A failure here leaves a quote without a number, which is
  // better than losing the lead.
  const { data: invoiceNumber } = await supabase.rpc("generate_invoice_number" as never);
  if (invoiceNumber != null) {
    await supabase
      .from("Events")
      .update({ invoice_number: Number(invoiceNumber) })
      .eq("id", event.id);
  }

  return event.id;
}
