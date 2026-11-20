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

/** What an address belongs to: a driver's home, or an event's place. */
export type AddressOwner = { table: "Drivers" | "Events"; id: string };

/**
 * The local writes that save an owner's address: the Addresses row it points at is overwritten in
 * place; one with none gets a new row, linked from its `address_uuid`. `newId` is the id a new row
 * would take (passed in so the writes can be checked).
 */
export function ownedAddressWrites(
  owner: AddressOwner,
  addressUuid: string | null,
  picked: PickedAddress,
  newId: string,
) {
  const columns = addressColumns(picked);
  if (addressUuid) {
    return [db.updateTable("Addresses").set(columns).where("id", "=", addressUuid).compile()];
  }
  const insert = db
    .insertInto("Addresses")
    .values({ id: newId, ...columns })
    .compile();
  const link =
    owner.table === "Drivers"
      ? db.updateTable("Drivers").set({ address_uuid: newId }).where("id", "=", owner.id).compile()
      : db.updateTable("Events").set({ address_uuid: newId }).where("id", "=", owner.id).compile();
  return [insert, link];
}

/** Saves an owner's address to the local database; PowerSync uploads it. */
export async function saveOwnedAddress(
  owner: AddressOwner,
  addressUuid: string | null,
  picked: PickedAddress,
): Promise<void> {
  for (const write of ownedAddressWrites(owner, addressUuid, picked, crypto.randomUUID())) {
    await typedExecute(write);
  }
}
