import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";

/** An address as loaded from the database, carrying the `Addresses` row it came from. */
export type StoredAddress = AddressFields & { id: string };

export const EMPTY_ADDRESS: AddressFields = {
  street: "",
  city: "",
  stateProvince: "",
  zipPostal: "",
};

/**
 * The `Addresses` columns a query selects for one joined address, under a column prefix.
 * Flattened, because `expect<Row>()` compares row types by identity and an intersection of
 * object types never matches the flat type a compiled query reports.
 */
export type AddressColumns<P extends string> = {
  [K in
    | "id"
    | "street"
    | "city"
    | "state_province"
    | "zip_postal"
    | "latitude"
    | "longitude"
    | "place_id"
    | "country" as `${P}${K}`]: K extends "latitude" | "longitude" ? number | null : string | null;
};

/** Maps prefixed `Addresses` columns from a left join back to an address, or null when absent. */
export function storedAddressFrom<P extends string>(
  row: AddressColumns<P>,
  prefix: P,
): StoredAddress | null {
  const r = row as unknown as Record<string, string | number | null>;
  const id = r[`${prefix}id`] as string | null;
  if (!id) return null;
  return {
    id,
    street: (r[`${prefix}street`] as string | null) ?? "",
    city: (r[`${prefix}city`] as string | null) ?? "",
    stateProvince: (r[`${prefix}state_province`] as string | null) ?? "",
    zipPostal: (r[`${prefix}zip_postal`] as string | null) ?? "",
    lat: (r[`${prefix}latitude`] as number | null) ?? undefined,
    lng: (r[`${prefix}longitude`] as number | null) ?? undefined,
    placeId: (r[`${prefix}place_id`] as string | null) ?? undefined,
    country: (r[`${prefix}country`] as string | null) ?? undefined,
  };
}

/** Collapses an intersection into a single object type, so `expect<Row>()` sees a match. */
export type Flat<T> = { [K in keyof T]: T[K] };

/** No street, city or state: nothing worth storing. */
export function isEmptyAddress(a: AddressFields): boolean {
  return !a.street && !a.city && !a.stateProvince;
}

/** "street, city, state zip, country" for read-only display. */
export function addressDisplayLine(a: AddressFields | null | undefined): string {
  if (!a || isEmptyAddress(a)) return "";
  const stateZip = [a.stateProvince, a.zipPostal].filter(Boolean).join(" ");
  return [a.street, a.city, stateZip, a.country].filter(Boolean).join(", ");
}
