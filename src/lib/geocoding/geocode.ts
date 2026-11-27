/**
 * Server-side geocoding of a typed address (Google Geocoding API, GOOGLE_MAPS_SERVER_KEY), for the
 * places an address is saved without anyone picking it from the address field: website leads, and
 * the backfill of old rows. The address field itself geocodes in the browser when a suggestion is
 * picked, so it does not need this.
 *
 * Never throws: a missing key, a timeout or no match gives null, and the caller saves the address
 * as typed. A lead must never be lost because Google was slow.
 */

export type AddressText = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
};

/** What a match adds to an Addresses row; country is the ISO-2 code, as the address field stores it. */
export type Geocoded = {
  latitude: number;
  longitude: number;
  place_id: string;
  country: string | null;
};

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 4000;

/** The text to geocode, or null when there is nothing worth looking up (no street and no city). */
export function geocodeQuery(a: AddressText): string | null {
  if (!a.street?.trim() && !a.city?.trim()) return null;
  return [a.street, a.city, a.state_province, a.zip_postal]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

type GoogleGeocodeResponse = {
  status?: string;
  results?: {
    place_id?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: { short_name?: string; types?: string[] }[];
  }[];
};

/** The first result of a Geocoding API answer, or null when it found nothing usable. Pure. */
export function parseGeocodeResponse(json: GoogleGeocodeResponse): Geocoded | null {
  if (json.status !== "OK") return null;
  const r = json.results?.[0];
  const lat = r?.geometry?.location?.lat;
  const lng = r?.geometry?.location?.lng;
  if (!r?.place_id || typeof lat !== "number" || typeof lng !== "number") return null;
  const country =
    r.address_components?.find((c) => c.types?.includes("country"))?.short_name ?? null;
  return { latitude: lat, longitude: lng, place_id: r.place_id, country };
}

/** Geocodes an address; null when there is no key, nothing to look up, no match or an error. */
export async function geocodeAddress(
  a: AddressText,
  key: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  fetchFn: typeof fetch = fetch,
): Promise<Geocoded | null> {
  const query = geocodeQuery(a);
  if (!key || !query) return null;
  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseGeocodeResponse((await res.json()) as GoogleGeocodeResponse);
  } catch (e) {
    console.error("[geocode] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
