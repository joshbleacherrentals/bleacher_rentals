import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";
import { isEmptyAddress } from "../logic/address";

export type SaveCompanyInput = {
  companyName: string;
  email: string;
  phone: string;
  notes: string;
  billingAddress: AddressFields;
  /** The caller passes the billing fields again when shipping is "same as billing". */
  shippingAddress: AddressFields;
};

export type ExistingAddressIds = { billing: string | null; shipping: string | null };

function addressColumns(addr: AddressFields) {
  return {
    street: addr.street || null,
    city: addr.city || null,
    state_province: addr.stateProvince || null,
    zip_postal: addr.zipPostal || null,
    latitude: addr.lat ?? null,
    longitude: addr.lng ?? null,
    country: addr.country ?? null,
    place_id: addr.placeId ?? null,
  };
}

/**
 * Writes one address slot and returns the row id the company should point at: `existingId` is
 * updated in place, otherwise a fresh row is inserted. An empty address stores no row — the old
 * one is left orphaned rather than deleted.
 */
async function writeAddress(
  addr: AddressFields,
  existingId: string | null,
): Promise<string | null> {
  if (isEmptyAddress(addr)) return null;

  if (existingId) {
    await typedExecute(
      db.updateTable("Addresses").set(addressColumns(addr)).where("id", "=", existingId).compile(),
    );
    return existingId;
  }

  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Addresses")
      .values({ id, ...addressColumns(addr) })
      .compile(),
  );
  return id;
}

/**
 * Creates a company when `existing` is null, otherwise updates it. Returns the company id.
 * See docs/specs/companies-contacts-forms.md §3.1 and §7 for the address rules.
 */
export async function saveCompany(
  input: SaveCompanyInput,
  existing: { id: string; addressIds: ExistingAddressIds } | null,
): Promise<string> {
  try {
    const billingExisting = existing?.addressIds.billing ?? null;
    // A legacy company whose two uuids point at one row gets its shipping split off.
    const shippingExisting =
      existing?.addressIds.shipping && existing.addressIds.shipping !== billingExisting
        ? existing.addressIds.shipping
        : null;

    const billingId = await writeAddress(input.billingAddress, billingExisting);
    const shippingId = await writeAddress(input.shippingAddress, shippingExisting);

    const columns = {
      company_name: input.companyName,
      email: input.email || null,
      phone: input.phone || null,
      notes: input.notes || null,
      billing_address_uuid: billingId,
      shipping_address_uuid: shippingId,
    };

    if (existing) {
      await typedExecute(
        db.updateTable("Companies").set(columns).where("id", "=", existing.id).compile(),
      );
      return existing.id;
    }

    const id = crypto.randomUUID();
    await typedExecute(
      db
        .insertInto("Companies")
        .values({ id, ...columns, deleted: 0 })
        .compile(),
    );
    return id;
  } catch (e) {
    createErrorToast(["Failed to save company.", e instanceof Error ? e.message : ""]);
    throw e;
  }
}
