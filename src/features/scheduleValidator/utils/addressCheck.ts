/**
 * Whether a stored address is complete enough for the work tracker model: every column filled,
 * coordinates and Google place included (the model measures distance from the coordinates). Shared by
 * Driver Data and Event Data. Pure.
 */

/** An address as stored (the Addresses row), null when none is linked. */
export type StoredAddress = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/** How one thing did on one requirement: ok, or what is missing. */
export type RequirementResult = { ok: boolean; problem: string | null };

const ADDRESS_FIELDS: { field: keyof StoredAddress; label: string }[] = [
  { field: "street", label: "street" },
  { field: "city", label: "city" },
  { field: "state_province", label: "state/province" },
  { field: "zip_postal", label: "zip/postal code" },
  { field: "country", label: "country" },
  { field: "latitude", label: "latitude" },
  { field: "longitude", label: "longitude" },
  { field: "place_id", label: "Google place" },
];

const isBlank = (value: string | number | null) =>
  value === null || (typeof value === "string" && value.trim() === "");

/** Passes when every column is filled; otherwise names what is missing (`whenNone` with no row). */
export function checkAddress(address: StoredAddress | null, whenNone: string): RequirementResult {
  if (!address) return { ok: false, problem: whenNone };
  const missing = ADDRESS_FIELDS.filter(({ field }) => isBlank(address[field])).map(
    ({ label }) => label,
  );
  return missing.length === 0
    ? { ok: true, problem: null }
    : { ok: false, problem: `Missing ${missing.join(", ")}` };
}
