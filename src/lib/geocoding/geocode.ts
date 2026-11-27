/**
 * Server-side geocoding of a typed address (Google Geocoding API, GOOGLE_MAPS_SERVER_KEY), for the
 * places an address is saved without anyone picking it from the address field: website leads, and
 * the Address Backfill of old rows. The address field itself geocodes in the browser when a
 * suggestion is picked, so it does not need this.
 *
 * A wrong position is worse than none (a bleacher pinned to a city centre), so an answer is only
 * used when Google is confident it found that exact place (judgeGeocode). Never throws: a missing
 * key, a timeout or no match gives null, and the caller saves the address as typed.
 */

export type AddressText = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
};

/** What a confident match adds to an Addresses row; country is the ISO-2 code, as the field stores it. */
export type Geocoded = {
  latitude: number;
  longitude: number;
  place_id: string;
  country: string | null;
};

/** Google's whole answer for one address, for judging and for showing on the backfill preview. */
export type GeocodeAnswer = Geocoded & {
  formattedAddress: string;
  /** ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER or APPROXIMATE. */
  locationType: string;
  partialMatch: boolean;
  types: string[];
  /** The state or province, as its code and its full name. */
  state: { short: string | null; long: string | null };
};

export type Judgement = { ok: true } | { ok: false; reason: string };

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 4000;

/** Places whose centre is the place itself: a fairground, an arena, a building. Not a road or a town. */
const PLACE_TYPES = ["establishment", "point_of_interest", "premise", "subpremise", "park"];

/**
 * The text to look up, or null when there is nothing worth looking up (no street and no city).
 * Many old rows hold Google's whole description in the street ("500 Boulevard Cote Vertu Ouest,
 * Dorval, Montreal, QC H4S 1Y9, Canada"): that is sent alone, not with the city and zip again.
 */
export function geocodeQuery(a: AddressText): string | null {
  const street = a.street?.trim() ?? "";
  if (!street && !a.city?.trim()) return null;
  if (street.includes(",")) return street;
  return [street, a.city, a.state_province, a.zip_postal]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

type GoogleGeocodeResponse = {
  status?: string;
  results?: {
    place_id?: string;
    formatted_address?: string;
    partial_match?: boolean;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
    address_components?: { short_name?: string; long_name?: string; types?: string[] }[];
  }[];
};

/** The first result of a Geocoding API answer, or null when it found nothing usable. Pure. */
export function parseGeocodeResponse(json: GoogleGeocodeResponse): GeocodeAnswer | null {
  if (json.status !== "OK") return null;
  const r = json.results?.[0];
  const lat = r?.geometry?.location?.lat;
  const lng = r?.geometry?.location?.lng;
  if (!r?.place_id || typeof lat !== "number" || typeof lng !== "number") return null;
  const component = (type: string) => r.address_components?.find((c) => c.types?.includes(type));
  const state = component("administrative_area_level_1");
  return {
    latitude: lat,
    longitude: lng,
    place_id: r.place_id,
    country: component("country")?.short_name ?? null,
    formattedAddress: r.formatted_address ?? "",
    locationType: r.geometry?.location_type ?? "APPROXIMATE",
    partialMatch: r.partial_match === true,
    types: r.types ?? [],
    state: { short: state?.short_name ?? null, long: state?.long_name ?? null },
  };
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Whether an answer can be trusted as this address' position. Pure.
 *  - a building (ROOFTOP) or a point on the right street (RANGE_INTERPOLATED): yes;
 *  - the centre of a named place (a fairground, an arena): only when the answer is that place;
 *  - a town's or region's centre (APPROXIMATE), a road's centre, or a partial match: no;
 *  - and the row must name its state or province, and Google's answer must be in it. "12 Winding
 *    Way" alone could be in London, Ontario or in Ohio: without a province nothing says which, so
 *    no answer is trusted.
 */
export function judgeGeocode(a: AddressText, g: GeocodeAnswer): Judgement {
  if (!a.state_province?.trim()) {
    return { ok: false, reason: "no state or province to know where it is" };
  }
  if (g.partialMatch) return { ok: false, reason: "Google only partly matched it" };
  const precise = g.locationType === "ROOFTOP" || g.locationType === "RANGE_INTERPOLATED";
  const place =
    g.locationType === "GEOMETRIC_CENTER" && g.types.some((t) => PLACE_TYPES.includes(t));
  if (!precise && !place) {
    return {
      ok: false,
      reason:
        g.locationType === "APPROXIMATE"
          ? "only a town or area, not an address"
          : "only a road or area centre, not an address",
    };
  }
  if (!same(a.state_province, g.state.short) && !same(a.state_province, g.state.long)) {
    return {
      ok: false,
      reason: `Google put it in ${g.state.long ?? g.state.short ?? "another state"}`,
    };
  }
  return { ok: true };
}

/** Google's answer for an address; null when there is no key, nothing to look up, no match or an error. */
export async function lookupAddress(
  a: AddressText,
  key: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeAnswer | null> {
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

/** The position to save for an address: Google's answer only when it is confident (judgeGeocode). */
export async function geocodeAddress(
  a: AddressText,
  key: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  fetchFn: typeof fetch = fetch,
): Promise<Geocoded | null> {
  const g = await lookupAddress(a, key, fetchFn);
  if (!g || !judgeGeocode(a, g).ok) return null;
  return { latitude: g.latitude, longitude: g.longitude, place_id: g.place_id, country: g.country };
}
