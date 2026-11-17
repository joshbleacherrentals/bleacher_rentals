"use client";

import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { EventDashboard, type EventDashboardData } from "../pixi/EventDashboard";
import type { SuggestedTrip } from "../utils/suggestions";

/**
 * Mounts the Pixi app and keeps the Event Dashboard in it up to date with `data`. Mirrors how the
 * Dashboard page mounts its own (same WebGL check, same resize handling).
 */
export function EventDashboardCanvas({
  data,
  onAccept,
}: {
  data: EventDashboardData;
  onAccept: (trip: SuggestedTrip) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<EventDashboard | null>(null);
  const dataRef = useRef(data);
  const onAcceptRef = useRef(onAccept);
  const [gpuDisabled, setGpuDisabled] = useState(false);

  dataRef.current = data;
  onAcceptRef.current = onAccept;

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let observer: ResizeObserver | null = null;
    const app = new Application();

    const init = () => {
      rafId = requestAnimationFrame(async () => {
        if (cancelled) return;
        const host = hostRef.current;
        if (!host || !host.isConnected) return init();

        try {
          await app.init({
            resizeTo: host,
            background: "#ffffff",
            resolution: window.devicePixelRatio,
            autoDensity: true,
            antialias: false,
            powerPreference: "high-performance",
            roundPixels: false,
          });
          if (cancelled) return;

          const rendererType = (app.renderer as { type?: number | string }).type;
          if (rendererType !== "webgl" && rendererType !== 1) {
            setGpuDisabled(true);
            return;
          }
          host.appendChild(app.canvas);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (cancelled) return;

          dashboardRef.current = new EventDashboard(app, {
            ...dataRef.current,
            onAccept: (trip) => onAcceptRef.current(trip),
          });

          // CSS-driven size changes (sliding panels) rebuild through the same handler as a window resize.
          let raf = 0;
          observer = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
          });
          observer.observe(host);
        } catch (error) {
          console.error("Error initializing the Event Dashboard:", error);
          setGpuDisabled(true);
        }
      });
    };
    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      try {
        dashboardRef.current?.destroy();
      } catch {}
      dashboardRef.current = null;
      try {
        app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
      } catch {}
    };
  }, []);

  useEffect(() => {
    dashboardRef.current?.setData(data);
  }, [data]);

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden border-l border-t border-gray-300">
      {gpuDisabled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white p-6 text-sm text-yellow-800">
          This view needs GPU acceleration. Enable hardware acceleration in your browser settings
          and restart it.
        </div>
      )}
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
