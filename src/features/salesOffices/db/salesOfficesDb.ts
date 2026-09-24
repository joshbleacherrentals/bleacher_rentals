import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";

// ── Types ──

export type SalesOfficeRow = {
  id: string;
  name: string | null;
  address_uuid: string | null;
  quickbook_uuid: string | null;
  stripe_connection_uuid: string | null;
  payment_info: string | null;
  deleted: number | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
};

export type QboConnectionOption = {
  id: string;
  displayName: string;
  // The office's currency is inherited from its QuickBooks connection.
  currency: string | null;
};

export type SalesOfficeAddress = {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
};

export type SalesOfficeInput = {
  name: string;
  quickbookUuid: string;
  // Optional: office falls back to the default Stripe account when null.
  stripeConnectionUuid: string | null;
  address: SalesOfficeAddress | null;
  /** Extra payment instructions for the customer's quote; blank is stored as null. */
  paymentInfo: string | null;
};

// ── Read (PowerSync, reactive) ──

export const allSalesOfficesQuery = db
  .selectFrom("SalesOffices as so")
  .leftJoin("Addresses as a", "so.address_uuid", "a.id")
  .select([
    "so.id as id",
    "so.name as name",
    "so.address_uuid as address_uuid",
    "so.quickbook_uuid as quickbook_uuid",
    "so.stripe_connection_uuid as stripe_connection_uuid",
    "so.payment_info as payment_info",
    "so.deleted as deleted",
    "a.street as address_street",
    "a.city as address_city",
    "a.state_province as address_state",
    "a.zip_postal as address_zip",
  ])
  .where("so.deleted", "=", 0)
  .orderBy("so.name")
  .compile();

export async function fetchAllSalesOffices(): Promise<SalesOfficeRow[]> {
  return typedGetAll(allSalesOfficesQuery, expect<SalesOfficeRow>());
}

// QboConnections is intentionally NOT synced to PowerSync. The table contains
// `encrypted_token_value` (QuickBooks OAuth credentials). Syncing it locally
// would store payment credentials in every client's SQLite DB, expanding the
// blast radius of a device compromise. The display_name and currency we need
// here are a small, infrequent read — Supabase online fetch is fine.
export async function fetchQboConnections(
  supabase: SupabaseClient<Database>,
): Promise<QboConnectionOption[]> {
  const { data, error } = await supabase
    .from("QboConnections")
    .select("id, display_name, currency")
    .order("display_name");

  if (error) {
    console.error("Failed to fetch QBO connections:", error);
    return [];
  }

  return (data ?? []).map((q) => ({
    id: q.id,
    displayName: q.display_name,
    currency: q.currency,
  }));
}

// ── Setup completeness ──

export type SalesOfficeSetup = {
  complete: boolean;
  /** Human-readable names of the pieces still missing. */
  missing: string[];
};

/**
 * A sales office is "fully set up" only when it has everything needed to send a
 * quote and take payment: an address, a QuickBooks connection (which also gives
 * it a currency), and a Stripe connection. Name is always required to save.
 */
export function getSalesOfficeSetup(office: SalesOfficeRow): SalesOfficeSetup {
  const missing: string[] = [];
  if (!office.address_uuid) missing.push("address");
  if (!office.quickbook_uuid) missing.push("QuickBooks account");
  if (!office.stripe_connection_uuid) missing.push("Stripe account");
  return { complete: missing.length === 0, missing };
}

// ── Writes (PowerSync local-first / optimistic) ──

export async function upsertSalesOfficeAddress(
  address: SalesOfficeAddress | null,
  existingAddressUuid: string | null,
): Promise<string | null> {
  if (!address || !address.street) return existingAddressUuid ?? null;

  const values = {
    street: address.street,
    city: address.city,
    state_province: address.stateProvince,
    zip_postal: address.zipPostal || null,
    latitude: address.lat ?? null,
    longitude: address.lng ?? null,
    country: address.country ?? null,
    place_id: address.placeId ?? null,
  };

  if (existingAddressUuid) {
    await typedExecute(
      db
        .updateTable("Addresses")
        .set(values as any)
        .where("id", "=", existingAddressUuid)
        .compile(),
    );
    return existingAddressUuid;
  }

  const addressUuid = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Addresses")
      .values({ id: addressUuid, ...values } as any)
      .compile(),
  );
  return addressUuid;
}

export async function createSalesOffice(params: SalesOfficeInput): Promise<string> {
  const addressUuid = await upsertSalesOfficeAddress(params.address, null);

  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("SalesOffices")
      .values({
        id,
        name: params.name,
        quickbook_uuid: params.quickbookUuid,
        stripe_connection_uuid: params.stripeConnectionUuid,
        address_uuid: addressUuid,
        payment_info: params.paymentInfo?.trim() || null,
        deleted: 0,
      } as any)
      .compile(),
  );

  return id;
}

export async function updateSalesOffice(
  id: string,
  existingAddressUuid: string | null,
  params: SalesOfficeInput,
): Promise<void> {
  const addressUuid = await upsertSalesOfficeAddress(params.address, existingAddressUuid);

  await typedExecute(
    db
      .updateTable("SalesOffices")
      .set({
        name: params.name,
        quickbook_uuid: params.quickbookUuid,
        stripe_connection_uuid: params.stripeConnectionUuid,
        address_uuid: addressUuid,
        payment_info: params.paymentInfo?.trim() || null,
      } as any)
      .where("id", "=", id)
      .compile(),
  );
}

export async function softDeleteSalesOffice(id: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("SalesOffices")
      .set({ deleted: 1 } as any)
      .where("id", "=", id)
      .compile(),
  );
}
