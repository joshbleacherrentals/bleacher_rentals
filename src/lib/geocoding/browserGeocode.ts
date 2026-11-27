import { getGeocode } from "use-places-autocomplete";
import { geocodeQuery, type AddressText, type GeocodeAnswer } from "./geocode";

/**
 * Geocoding in the browser, through the Google Maps script the app already loads with the browser
 * key (the same call the address field makes when a suggestion is picked). Used by the Address
 * Backfill, so it needs no server key. Its answers are judged with the same rules as the server's
 * (judgeGeocode in ./geocode).
 */

/** The parts of a google.maps.GeocoderResult this reads (lat and lng are functions there). */
export type GeocoderResultLike = {
  place_id?: string;
  formatted_address?: string;
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location?: { lat: () => number; lng: () => number };
    location_type?: string;
  };
  address_components?: { short_name?: string; long_name?: string; types?: string[] }[];
};

/** A browser geocoder result as the answer judgeGeocode reads, or null when it is unusable. Pure. */
export function answerFromGeocoderResult(r: GeocoderResultLike | undefined): GeocodeAnswer | null {
  const location = r?.geometry?.location;
  if (!r?.place_id || !location) return null;
  const lat = location.lat();
  const lng = location.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
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

/** Thrown when Google asks to slow down, so the caller can wait and try again. */
export class GeocodeRateLimited extends Error {
  constructor() {
    super("Google asked to slow down");
  }
}

/**
 * Google's answer for an address, looked up in the browser; null when there is nothing to look up
 * or Google found nothing. Throws GeocodeRateLimited when Google asks to slow down, and any other
 * error (the Maps script not loaded, the key refused) as it is.
 */
export async function browserLookup(a: AddressText): Promise<GeocodeAnswer | null> {
  const query = geocodeQuery(a);
  if (!query) return null;
  try {
    const results = (await getGeocode({ address: query })) as unknown as GeocoderResultLike[];
    return answerFromGeocoderResult(results[0]);
  } catch (e) {
    const status = typeof e === "string" ? e : (e as { code?: string })?.code;
    if (status === "ZERO_RESULTS") return null;
    if (status === "OVER_QUERY_LIMIT") throw new GeocodeRateLimited();
    throw e instanceof Error ? e : new Error(`Google refused the lookup (${String(status ?? e)})`);
  }
}
