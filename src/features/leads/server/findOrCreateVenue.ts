import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { venueAddressKey } from "@/features/venues/logic/venueAddressKey";
import type { ParsedLead } from "../logic/parseWpformsLead";

type AdminClient = SupabaseClient<Database>;

/** Escapes `%`, `_` and `\` so `ilike` matches the text as written. */
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The venue at the lead's address, or a new one: two venues never share an address (the same
 * street, city, province and zip, ignoring case and spacing, as `venueAddressKey` compares them),
 * so a lead at a known address belongs to the venue that is already there.
 *
 * A lead without a street gets no venue (null): a bare city or zip is not a place worth keeping,
 * and the quote keeps its own address row instead. A new venue is named after the street, since
 * the form gives no venue name; staff can rename it.
 */
export async function findOrCreateVenue(
  supabase: AdminClient,
  lead: ParsedLead,
): Promise<string | null> {
  if (!lead.street) return null;

  const key = venueAddressKey({
    street: lead.street,
    city: lead.city,
    stateProvince: lead.stateProvince,
    zipPostal: lead.zipPostal ?? "",
  });

  const { data: addresses, error: addressError } = await supabase
    .from("Addresses")
    .select("id, street, city, state_province, zip_postal")
    .ilike("street", likeLiteral(lead.street));
  if (addressError) throw new Error(`Could not look up the address: ${addressError.message}`);

  const sameAddressIds = (addresses ?? [])
    .filter(
      (a) =>
        venueAddressKey({
          street: a.street,
          city: a.city,
          stateProvince: a.state_province,
          zipPostal: a.zip_postal ?? "",
        }) === key,
    )
    .map((a) => a.id);

  if (sameAddressIds.length > 0) {
    const { data: venue, error: venueError } = await supabase
      .from("Venues")
      .select("id")
      .in("address_uuid", sameAddressIds)
      .eq("deleted", false)
      .limit(1)
      .maybeSingle();
    if (venueError) throw new Error(`Could not look up the venue: ${venueError.message}`);
    if (venue) return venue.id;
  }

  const { data: address, error: newAddressError } = await supabase
    .from("Addresses")
    .insert({
      street: lead.street,
      city: lead.city,
      state_province: lead.stateProvince,
      zip_postal: lead.zipPostal,
    })
    .select("id")
    .single();
  if (newAddressError) throw new Error(`Could not create the address: ${newAddressError.message}`);

  const { data: venue, error: newVenueError } = await supabase
    .from("Venues")
    .insert({ name: lead.street, address_uuid: address.id })
    .select("id")
    .single();
  if (newVenueError) throw new Error(`Could not create the venue: ${newVenueError.message}`);
  return venue.id;
}
