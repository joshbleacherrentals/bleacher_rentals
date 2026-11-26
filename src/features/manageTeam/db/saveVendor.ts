import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import {
  isEmptyVendorAddress,
  validateVendorForm,
  vendorColumns,
  type VendorAddress,
  type VendorFormError,
  type VendorFormValues,
} from "../utils/vendorForm";

/** The `Addresses` columns of a vendor's address, the same ones the company form writes. */
function addressColumns(a: VendorAddress) {
  return {
    street: a.street,
    city: a.city,
    state_province: a.stateProvince,
    zip_postal: a.zipPostal,
    latitude: a.latitude,
    longitude: a.longitude,
    country: a.country,
    place_id: a.placeId,
  };
}

export type SaveVendorInput = {
  values: VendorFormValues;
  /** The vendor being edited with the address row it points at; null for a new vendor. */
  existing: { id: string; addressUuid: string | null } | null;
  /**
   * Whether the window changed or cleared the address. An untouched address is not written, and
   * the vendor keeps pointing at it, also when its row has not synced and the form shows none.
   */
  addressTouched: boolean;
  logoUrl: string | null;
};

/**
 * Writes the address (D13) and returns the row id the vendor should point at: the vendor's own
 * row is updated in place, a vendor with none gets a new row, and an emptied address stores no
 * row — the old one is left in the table, never deleted.
 */
async function writeAddress(
  address: VendorAddress | null,
  existingId: string | null,
): Promise<string | null> {
  if (isEmptyVendorAddress(address) || !address) return null;

  if (existingId) {
    await typedExecute(
      db
        .updateTable("Addresses")
        .set(addressColumns(address))
        .where("id", "=", existingId)
        .compile(),
    );
    return existingId;
  }

  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Addresses")
      .values({ id, ...addressColumns(address) })
      .compile(),
  );
  return id;
}

/**
 * Creates the vendor when `existing` is null, otherwise updates it, and returns the vendor id. The
 * address is written first, so its row exists when the vendor points at it. Raises when a write
 * fails; the window shows the error.
 */
export async function saveVendor(input: SaveVendorInput): Promise<string> {
  const { values, existing, addressTouched, logoUrl } = input;

  const addressUuid = addressTouched
    ? await writeAddress(values.address, existing?.addressUuid ?? null)
    : (existing?.addressUuid ?? null);

  const columns = vendorColumns(values, addressUuid, logoUrl);

  if (existing) {
    await typedExecute(
      db.updateTable("Vendors").set(columns).where("id", "=", existing.id).compile(),
    );
    return existing.id;
  }

  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Vendors")
      .values({ id, ...columns, is_active: 1, created_at: new Date().toISOString() })
      .compile(),
  );
  return id;
}

export type SubmitVendorOutcome =
  | { status: "invalid"; error: VendorFormError }
  | { status: "saved"; id: string; created: boolean };

/**
 * The window's Save: the checks first, then the logo upload (only for a file the user chose), then
 * the write. Nothing is uploaded or written for an invalid form.
 */
export async function submitVendor(
  input: SaveVendorInput & {
    /** Uploads the chosen logo file and returns its public URL; absent when no file is chosen. */
    uploadLogo?: () => Promise<string>;
  },
): Promise<SubmitVendorOutcome> {
  const error = validateVendorForm(input.values);
  if (error) return { status: "invalid", error };

  const logoUrl = input.uploadLogo ? await input.uploadLogo() : input.logoUrl;
  const id = await saveVendor({ ...input, logoUrl });
  return { status: "saved", id, created: input.existing === null };
}

/** Delete is `false`, Restore is `true` (D15): the only thing either does is `is_active`. */
export async function setVendorActive(id: string, active: boolean): Promise<void> {
  await typedExecute(
    db
      .updateTable("Vendors")
      .set({ is_active: active ? 1 : 0 })
      .where("id", "=", id)
      .compile(),
  );
}
