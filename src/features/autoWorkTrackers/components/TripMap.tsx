"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps, type GoogleMaps } from "@/components/maps/loadGoogleMaps";
import { NO_DRIVER, type DriverLoops, type MapPoint } from "../utils/tripMap";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Southern Ontario, where most trips are, until the work trackers' own bounds are known.
const FALLBACK_CENTER = { lat: 43.6, lng: -80.0 };

const formatKm = (km: number) => `${Math.round(km).toLocaleString()} km`;

/**
 * Draws each driver's routes on a Google map: a solid line with an arrow for hauling (pickup to
 * drop-off), a dashed line for deadhead (from home or the previous drop-off to a pickup, and the
 * last drop-off home), a large dot at each
 * driver's home and small dark dots at the pickups and drop-offs. Lines are straight, not roads.
 */
export function MapCanvas({
  loops,
  showDeadhead,
}: {
  loops: DriverLoops[];
  showDeadhead: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<GoogleMaps>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(["maps", "marker"])
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(containerRef.current, {
          center: FALLBACK_CENTER,
          zoom: 7,
          mapTypeControl: false,
          streetViewControl: false,
        });
        infoRef.current = new maps.InfoWindow();
        setReady(true);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Frame every point once the data arrives or changes, not on each visibility toggle.
  const pointsKey = useMemo(
    () =>
      loops
        .flatMap((l) => [l.home, ...l.stops])
        .filter(Boolean)
        .map((p) => `${p!.lat},${p!.lng}`)
        .join("|"),
    [loops],
  );
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map || !pointsKey) return;
    const bounds = new maps.LatLngBounds();
    for (const loop of loops) {
      for (const p of [loop.home, ...loop.stops]) if (p) bounds.extend(p);
    }
    map.fitBounds(bounds, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointsKey]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map) return;
    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];
    const add = (overlay: any) => overlaysRef.current.push(overlay);

    const openInfo = (html: string, position: MapPoint | { lat: number; lng: number }) => {
      infoRef.current.setContent(html);
      infoRef.current.setPosition(position);
      infoRef.current.open({ map });
    };

    const stops = new Map<string, MapPoint>();
    for (const loop of loops) {
      for (const leg of loop.legs) {
        if (leg.kind === "deadhead" && !showDeadhead) continue;
        const hauling = leg.kind === "hauling";
        const line = new maps.Polyline({
          map,
          path: [leg.from, leg.to],
          strokeColor: loop.color,
          strokeOpacity: hauling ? 0.9 : 0,
          strokeWeight: hauling ? 3 : 2,
          zIndex: hauling ? 2 : 1,
          icons: hauling
            ? [
                {
                  icon: { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5 },
                  offset: "60%",
                },
              ]
            : [
                {
                  icon: { path: "M 0,-1 0,1", strokeOpacity: 0.75, scale: 2.5 },
                  offset: "0",
                  repeat: "12px",
                },
              ],
        });
        line.addListener("click", (e: any) =>
          openInfo(
            `<b>${loop.name}</b><br/>${leg.trip}<br/>${hauling ? "Hauling" : "Deadhead"}: ${formatKm(
              leg.km,
            )} straight-line`,
            e.latLng.toJSON(),
          ),
        );
        add(line);
      }
      for (const stop of loop.stops) stops.set(`${stop.lat},${stop.lng}`, stop);
      if (loop.home) {
        add(
          new maps.Marker({
            map,
            position: loop.home,
            title: `${loop.name}: home`,
            zIndex: 4,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: loop.color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          }),
        );
      }
    }
    for (const stop of stops.values()) {
      add(
        new maps.Marker({
          map,
          position: stop,
          title: stop.label,
          zIndex: 3,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor: "#111827",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1,
          },
        }),
      );
    }
  }, [ready, loops, showDeadhead]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border bg-gray-50 text-sm text-red-700">
        {error}
      </div>
    );
  }
  return (
    <div ref={containerRef} className="h-full w-full rounded-md border" data-testid="trip-map" />
  );
}

/**
 * The Dashboard's map view: every work tracker dated in the week drawn as its driver's loop, with a
 * legend to show or hide each driver and the deadhead, and each driver's straight-line totals.
 */
export function TripMap({ loops, trackers }: { loops: DriverLoops[]; trackers: number }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showDeadhead, setShowDeadhead] = useState(true);

  const visible = useMemo(() => loops.filter((l) => !hidden.has(l.key)), [loops, hidden]);
  const incomplete = loops.reduce((sum, l) => sum + l.incomplete, 0);
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex h-full min-h-[480px] gap-3">
      <div className="min-w-0 flex-1">
        <MapCanvas loops={visible} showDeadhead={showDeadhead} />
      </div>
      <aside
        className="flex w-72 shrink-0 flex-col gap-2 overflow-auto text-sm"
        data-testid="trip-map-legend"
      >
        <div className="space-y-1 rounded-md border p-2">
          <div className="flex items-center gap-2">
            <svg width="36" height="8" aria-hidden>
              <line x1="0" y1="4" x2="36" y2="4" stroke="#374151" strokeWidth="3" />
            </svg>
            Hauling (pickup → drop-off)
          </div>
          <div className="flex items-center gap-2">
            <svg width="36" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="36"
                y2="4"
                stroke="#374151"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>
            Deadhead (from home, between trips, back home)
          </div>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={showDeadhead}
              onChange={(e) => setShowDeadhead(e.target.checked)}
            />
            Show deadhead
          </label>
          <p className="text-xs text-gray-500">
            Straight lines between coordinates, not roads. {trackers} work tracker
            {trackers === 1 ? "" : "s"} this week.
          </p>
          {incomplete > 0 && (
            <p className="text-xs text-amber-700">
              {incomplete} trip{incomplete === 1 ? " is" : "s are"} missing coordinates, so some of
              their lines are not drawn. Fix them on Driver Data and Bleacher Data.
            </p>
          )}
        </div>

        <div className="flex gap-2 text-xs">
          <button type="button" className="underline" onClick={() => setHidden(new Set())}>
            Show all
          </button>
          <button
            type="button"
            className="underline"
            onClick={() => setHidden(new Set(loops.map((l) => l.key)))}
          >
            Hide all
          </button>
        </div>

        {loops.map((loop) => (
          <label
            key={loop.key}
            className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-gray-50"
            data-testid="trip-map-driver"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={!hidden.has(loop.key)}
              onChange={() => toggle(loop.key)}
            />
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: loop.color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-medium">{loop.name}</span>
              <span className="block text-xs text-gray-600">
                {loop.trips} trip{loop.trips === 1 ? "" : "s"} · hauling {formatKm(loop.haulingKm)}
                {loop.key !== NO_DRIVER && ` · deadhead ${formatKm(loop.deadheadKm)}`}
              </span>
              {loop.key !== NO_DRIVER && !loop.home && (
                <span className="block text-xs text-amber-700">No home coordinates</span>
              )}
            </span>
          </label>
        ))}
      </aside>
    </div>
  );
}
