import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import type { AddressData } from "@/features/eventConfiguration/state/useCurrentEventStore";

export type AddressRow = {
  id: string;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  place_id: string | null;
};

/** An Addresses row in the work tracker window's shape, with every column it has. Pure. */
export function toAddressData(row: AddressRow): AddressData {
  return {
    addressUuid: row.id,
    address: row.street ?? "",
    city: row.city ?? undefined,
    state: row.state_province ?? undefined,
    postalCode: row.zip_postal ?? undefined,
    lat: row.latitude ?? undefined,
    lng: row.longitude ?? undefined,
    country: row.country ?? undefined,
    placeId: row.place_id ?? undefined,
  };
}

/**
 * One address, read once from the local database, with its map position, country and place id.
 * The populate buttons copy a neighbouring event's or tracker's address onto a work tracker: they
 * must copy all of it, or the tracker's address is saved without a map position.
 */
export async function fetchAddressData(addressUuid: string): Promise<AddressData | null> {
  const rows = await typedGetAll(
    db
      .selectFrom("Addresses")
      .select([
        "id",
        "street",
        "city",
        "state_province",
        "zip_postal",
        "latitude",
        "longitude",
        "country",
        "place_id",
      ])
      .where("id", "=", addressUuid)
      .limit(1)
      .compile(),
    expect<AddressRow>(),
  );
  return rows[0] ? toAddressData(rows[0]) : null;
}
