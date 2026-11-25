export type Place = { latitude?: number | null; longitude?: number | null };

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * How far apart two places are as the crow flies, in kilometres, or null when either has no
 * coordinates. It is shorter than the drive; the real road distance is for the trip planner.
 */
export function straightLineKm(
  from: Place | null | undefined,
  to: Place | null | undefined,
): number | null {
  if (!from || !to) return null;
  const { latitude: lat1, longitude: lon1 } = from;
  const { latitude: lat2, longitude: lon2 } = to;
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export const kmToMiles = (km: number) => km / KM_PER_MILE;
