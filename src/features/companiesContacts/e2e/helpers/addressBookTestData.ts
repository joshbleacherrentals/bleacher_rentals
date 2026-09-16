import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role seeding/reading for the shared company & contact form specs. Runs in the Node side
 * of the test — the UI is what writes, this is what proves the write landed.
 *
 * Everything seeded carries the same prefix in its name, so `cleanUp` can delete it all without
 * touching the rows other specs rely on.
 */
function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "address book e2e helper needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type AddressSeed = {
  street: string;
  city: string;
  state_province: string;
  zip_postal: string;
  country?: string;
};

async function insertAddress(address: AddressSeed): Promise<string> {
  const { data, error } = await admin().from("Addresses").insert(address).select("id").single();
  if (error || !data) throw new Error(`seed address failed: ${error?.message}`);
  return data.id as string;
}

export async function seedCompany(opts: {
  name: string;
  email?: string;
  phone?: string;
  billing: AddressSeed;
  /** Omit for a company whose shipping address is missing entirely. */
  shipping?: AddressSeed;
}) {
  const billingId = await insertAddress(opts.billing);
  const shippingId = opts.shipping ? await insertAddress(opts.shipping) : null;
  const { data, error } = await admin()
    .from("Companies")
    .insert({
      company_name: opts.name,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      billing_address_uuid: billingId,
      shipping_address_uuid: shippingId,
      deleted: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedCompany failed: ${error?.message}`);
  return { id: data.id as string, billingId, shippingId };
}

export async function seedVenue(opts: { name: string; address: AddressSeed }) {
  const addressId = await insertAddress(opts.address);
  const { data, error } = await admin()
    .from("Venues")
    .insert({ name: opts.name, address_uuid: addressId, deleted: false })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedVenue failed: ${error?.message}`);
  return { id: data.id as string, addressId };
}

export async function seedContact(opts: {
  firstName: string;
  lastName: string;
  email?: string;
  companyId?: string | null;
  defaultVenueId?: string | null;
  preferredLanguage?: "english" | "french";
}) {
  const { data, error } = await admin()
    .from("Contacts")
    .insert({
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: opts.email ?? null,
      company_uuid: opts.companyId ?? null,
      default_venue_uuid: opts.defaultVenueId ?? null,
      preferred_language: opts.preferredLanguage ?? "english",
      deleted: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedContact failed: ${error?.message}`);
  return { id: data.id as string };
}

type StoredCompany = {
  company_name: string;
  email: string | null;
  phone: string | null;
  billing_address_uuid: string | null;
  shipping_address_uuid: string | null;
};

/**
 * What is actually stored for a company, including both address uuids. The embedded selects come
 * back as a loose type from supabase-js, so the row is narrowed here rather than at every caller.
 */
export async function readCompany(id: string): Promise<StoredCompany | null> {
  const { data } = await admin()
    .from("Companies")
    .select(
      "company_name, email, phone, billing_address_uuid, shipping_address_uuid, " +
        "billing:Addresses!Companies_billing_address_uuid_fkey(street, city, state_province, zip_postal), " +
        "shipping:Addresses!Companies_shipping_address_uuid_fkey(street, city, state_province, zip_postal)",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as StoredCompany | null) ?? null;
}

export async function readContact(id: string) {
  const { data } = await admin()
    .from("Contacts")
    .select("first_name, last_name, email, default_venue_uuid, company_uuid")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Deletes everything this spec seeded, contacts first so no company/venue is still referenced. */
export async function cleanUp(prefix: string) {
  const db = admin();
  await db.from("Contacts").delete().like("last_name", `${prefix}%`);
  const { data: companies } = await db
    .from("Companies")
    .select("id, billing_address_uuid, shipping_address_uuid")
    .like("company_name", `${prefix}%`);
  const { data: venues } = await db
    .from("Venues")
    .select("id, address_uuid")
    .like("name", `${prefix}%`);

  await db.from("Companies").delete().like("company_name", `${prefix}%`);
  await db.from("Venues").delete().like("name", `${prefix}%`);

  const addressIds = [
    ...(companies ?? []).flatMap((c) => [c.billing_address_uuid, c.shipping_address_uuid]),
    ...(venues ?? []).map((v) => v.address_uuid),
  ].filter((id): id is string => !!id);
  if (addressIds.length > 0) await db.from("Addresses").delete().in("id", addressIds);
}
