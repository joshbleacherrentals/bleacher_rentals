/**
 * The Dashboard's map: each driver's work trackers for the week drawn as loops, home → pickup
 * (deadhead) → drop-off (hauling) → home (deadhead), in straight lines. One colour per driver. Pure.
 */

import { straightLineKm } from "./distance";

export type MapPoint = { lat: number; lng: number; label: string };

/** One work tracker dated in the week, with the coordinates it needs (null when missing). */
export type MapTracker = {
  workTrackerUuid: string;
  date: string;
  driverUuid: string | null;
  driverName: string | null;
  bleacherNumber: number | null;
  home: MapPoint | null;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
};

export type LegKind = "hauling" | "deadhead";

export type MapLeg = {
  kind: LegKind;
  from: MapPoint;
  to: MapPoint;
  km: number;
  /** e.g. "#12 · Tue, Sep 15". */
  trip: string;
};

export type DriverLoops = {
  /** The driver's id, or NO_DRIVER for trackers nobody is on yet (hauling only: no home). */
  key: string;
  name: string;
  color: string;
  home: MapPoint | null;
  stops: MapPoint[];
  legs: MapLeg[];
  trips: number;
  haulingKm: number;
  deadheadKm: number;
  /** Trips with a point missing coordinates, so some of their legs are not drawn. */
  incomplete: number;
};

export const NO_DRIVER = "__no_driver__";
const NO_DRIVER_COLOR = "#6b7280";

/** Distinct, readable on a map; repeats past its length. */
export const DRIVER_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
  "#059669",
  "#b91c1c",
  "#7c3aed",
  "#0d9488",
  "#c2410c",
  "#be185d",
  "#65a30d",
];

const km = (a: MapPoint, b: MapPoint) =>
  straightLineKm({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng }) ?? 0;

/** Each driver's loops, by name (the trackers with no driver last), each with its own colour. */
export function buildDriverLoops(
  trackers: MapTracker[],
  tripLabel: (t: MapTracker) => string,
): DriverLoops[] {
  const groups = new Map<string, MapTracker[]>();
  for (const t of trackers) {
    const key = t.driverUuid ?? NO_DRIVER;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const ordered = [...groups.entries()].sort(([ka, a], [kb, b]) => {
    if (ka === NO_DRIVER) return 1;
    if (kb === NO_DRIVER) return -1;
    return (a[0].driverName ?? "").localeCompare(b[0].driverName ?? "");
  });

  let colorIndex = 0;
  return ordered.map(([key, list]) => {
    const isNone = key === NO_DRIVER;
    const color = isNone ? NO_DRIVER_COLOR : DRIVER_COLORS[colorIndex++ % DRIVER_COLORS.length];
    const home = isNone ? null : (list.find((t) => t.home)?.home ?? null);
    const legs: MapLeg[] = [];
    const stops: MapPoint[] = [];
    let incomplete = 0;

    for (const t of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
      const trip = tripLabel(t);
      const { pickup, dropoff } = t;
      if (!pickup || !dropoff || (!isNone && !home)) incomplete++;
      if (pickup) stops.push(pickup);
      if (dropoff) stops.push(dropoff);
      const leg = (kind: LegKind, from: MapPoint | null, to: MapPoint | null) => {
        if (from && to) legs.push({ kind, from, to, km: km(from, to), trip });
      };
      if (!isNone) leg("deadhead", home, pickup);
      leg("hauling", pickup, dropoff);
      if (!isNone) leg("deadhead", dropoff, home);
    }

    const total = (kind: LegKind) =>
      legs.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.km, 0);
    return {
      key,
      name: isNone ? "No driver yet" : (list[0].driverName ?? "Unnamed driver"),
      color,
      home,
      stops,
      legs,
      trips: list.length,
      haulingKm: total("hauling"),
      deadheadKm: total("deadhead"),
      incomplete,
    };
  });
}
