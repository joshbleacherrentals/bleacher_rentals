/**
 * Road distances and drive times: the pure parts shared by the planner (browser) and the
 * road-times route (server). Google's Routes API "Compute Route Matrix" is asked the way the work
 * tracker modal asks for one trip (/api/distance): driving, no live traffic (TRAFFIC_UNAWARE, so
 * the same pair gets the same answer whenever it is asked), avoiding tolls. Points are rounded to 5
 * decimals (about a metre), so the same place always makes the same pair.
 */

import { straightLineKm } from "../utils/distance";

export type Point = [number, number]; // [latitude, longitude]
export type Pair = [Point, Point];

/** A pair's answer from Google (or the cache). Not found: Google has no route between them. */
export type RoadLeg = { found: boolean; meters: number | null; seconds: number | null };

export const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
export const FIELD_MASK = "originIndex,destinationIndex,status,condition,distanceMeters,duration";
export const MAX_ORIGINS = 25;
export const MAX_DESTINATIONS = 25; // 25 × 25 = 625 pairs: Google's cap per request

// The estimate for a pair Google did not answer: the straight line times ROAD_FACTOR at
// AVERAGE_SPEED_KMH. A place with no coordinates counts as UNKNOWN_MINUTES on the clock and costs
// UNKNOWN_COST_M, so the planner avoids it where it can.
export const ROAD_FACTOR = 1.3;
export const AVERAGE_SPEED_KMH = 80;
export const UNKNOWN_MINUTES = 120;
export const UNKNOWN_COST_M = 2_000_000;

export const roundPoint = ([lat, lng]: Point): Point => [
  Math.round(lat * 1e5) / 1e5,
  Math.round(lng * 1e5) / 1e5,
];

/** The cache key: both points to 5 decimals. No commas, so it fits a REST `in (...)` list. */
export function pairKey(from: Point, to: Point): string {
  const [a, b] = [roundPoint(from), roundPoint(to)];
  return [a[0], a[1], b[0], b[1]].map((n) => n.toFixed(5)).join("_");
}

/** The straight-line estimate between two known points, in metres and whole minutes. */
export function estimateLeg(from: Point, to: Point): { meters: number; minutes: number } {
  const km = straightLineKm(
    { latitude: from[0], longitude: from[1] },
    { latitude: to[0], longitude: to[1] },
  )!;
  const meters = Math.round(km * 1000 * ROAD_FACTOR);
  return { meters, minutes: Math.round((meters / 1000 / AVERAGE_SPEED_KMH) * 60) };
}

const waypoint = ([latitude, longitude]: Point) => ({
  waypoint: { location: { latLng: { latitude, longitude } } },
});

/** One request: driving, no live traffic, no tolls. */
export function matrixBody(origins: Point[], destinations: Point[]) {
  return {
    origins: origins.map((o) => ({ ...waypoint(o), routeModifiers: { avoidTolls: true } })),
    destinations: destinations.map(waypoint),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
  };
}

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
};

/** One request's answer, by pair key. Elements with an error status are left out. */
export function parseMatrix(
  elements: MatrixElement[],
  origins: Point[],
  destinations: Point[],
): Map<string, RoadLeg> {
  const legs = new Map<string, RoadLeg>();
  for (const e of elements) {
    if ((e.status?.code ?? 0) !== 0) continue;
    const key = pairKey(origins[e.originIndex ?? 0], destinations[e.destinationIndex ?? 0]);
    if (e.condition !== "ROUTE_EXISTS") {
      legs.set(key, { found: false, meters: null, seconds: null });
      continue;
    }
    legs.set(key, {
      found: true,
      meters: e.distanceMeters ?? 0,
      seconds: Math.round(parseFloat((e.duration ?? "0s").replace("s", "")) || 0),
    });
  }
  return legs;
}

/**
 * Origin × destination blocks covering every pair, each within Google's 625-pair cap. Origins that
 * need the same destinations sit together, so a block asks for few pairs nobody wanted.
 */
export function matrixBlocks(pairs: Pair[]): [Point[], Point[]][] {
  const byOrigin = new Map<string, { origin: Point; dests: Map<string, Point> }>();
  for (const [o, d] of pairs) {
    const ok = o.join(",");
    const entry = byOrigin.get(ok) ?? { origin: o, dests: new Map() };
    entry.dests.set(d.join(","), d);
    byOrigin.set(ok, entry);
  }
  const origins = [...byOrigin.values()].sort((a, b) =>
    [...a.dests.keys()]
      .sort()
      .join("|")
      .localeCompare([...b.dests.keys()].sort().join("|")),
  );
  const blocks: [Point[], Point[]][] = [];
  for (let i = 0; i < origins.length; i += MAX_ORIGINS) {
    const group = origins.slice(i, i + MAX_ORIGINS);
    const wanted = new Map<string, Point>();
    for (const g of group) for (const [k, d] of g.dests) wanted.set(k, d);
    const dests = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => d);
    for (let j = 0; j < dests.length; j += MAX_DESTINATIONS) {
      blocks.push([group.map((g) => g.origin), dests.slice(j, j + MAX_DESTINATIONS)]);
    }
  }
  return blocks;
}
