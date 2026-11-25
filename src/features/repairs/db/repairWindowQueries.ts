import { db } from "@/components/providers/SystemProvider";

/**
 * The local query behind the repair window: the address of the repair's vendor. It returns a
 * compiled Kysely query with its own row type; `useRepairDetails` ties it to the type with
 * `expect<T>()`, so a change to the local schema breaks the build here. How the row is written as a
 * line is decided in `../utils/repairWindow.ts`. docs/specs/repairs-07-repair-window.md §3 (D100).
 *
 * The query never uses `db.fn` (the app's `db` is a bound proxy that strips its helper methods) and
 * lists its columns: the street and the postal code are not shown, so they are not read.
 */

export type RawVendorAddressRow = {
  id: string; // the vendor's id
  city: string | null;
  stateProvince: string | null;
  country: string | null;
};

/** The vendor with the city, state and country of its address; nulls when it has no address. */
export function buildVendorAddressQuery(vendorUuid: string) {
  return db
    .selectFrom("Vendors as v")
    .leftJoin("Addresses as a", "a.id", "v.address_uuid")
    .select([
      "v.id as id",
      "a.city as city",
      "a.state_province as stateProvince",
      "a.country as country",
    ])
    .where("v.id", "=", vendorUuid)
    .compile();
}
