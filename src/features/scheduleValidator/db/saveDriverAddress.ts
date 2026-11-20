import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/** An address picked from the Google autocomplete: every part, with its coordinates and place. */
export type PickedAddress = {
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

function addressColumns(picked: PickedAddress) {
  return {
    street: picked.address || null,
    city: picked.city || null,
    state_province: picked.state || null,
    zip_postal: picked.postalCode || null,
    country: picked.country || null,
    latitude: picked.lat ?? null,
    longitude: picked.lng ?? null,
    place_id: picked.placeId || null,
  };
}

/**
 * The local writes that save a driver's home address: the driver's own Addresses row is overwritten
 * in place; a driver with none gets a new row, linked from Drivers.address_uuid. `newId` is the id a
 * new row would take (passed in so the writes can be checked).
 */
export function driverAddressWrites(
  driverUuid: string,
  addressUuid: string | null,
  picked: PickedAddress,
  newId: string,
) {
  const columns = addressColumns(picked);
  if (addressUuid) {
    return [db.updateTable("Addresses").set(columns).where("id", "=", addressUuid).compile()];
  }
  return [
    db
      .insertInto("Addresses")
      .values({ id: newId, ...columns })
      .compile(),
    db.updateTable("Drivers").set({ address_uuid: newId }).where("id", "=", driverUuid).compile(),
  ];
}

/** Saves a driver's home address to the local database; PowerSync uploads it. */
export async function saveDriverAddress(
  driverUuid: string,
  addressUuid: string | null,
  picked: PickedAddress,
): Promise<void> {
  for (const write of driverAddressWrites(driverUuid, addressUuid, picked, crypto.randomUUID())) {
    await typedExecute(write);
  }
}
