/**
 * How far out a single-pin map opens: about a province or state, so the pin shows where it is in the
 * region (Google's embed zoom: 1 is the world, 15 a few streets). Opening at street level meant
 * zooming out about eight times on every open.
 */
export const PLACE_MAP_START_ZOOM = 7;

/** A Google Maps embed URL with one pin at the coordinates. */
export function placeMapEmbedUrl(
  lat: number,
  lng: number,
  apiKey: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  zoom: number = PLACE_MAP_START_ZOOM,
): string {
  const params = new URLSearchParams({ key: apiKey ?? "", q: `${lat},${lng}`, zoom: String(zoom) });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}
