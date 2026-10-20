"use client";

import { useEffect, useState } from "react";

/**
 * The current time in ms, refreshed every `intervalMs` while the tab is visible. Each tick reads the
 * clock, it does not add to a counter, so a throttled background tab, a sleeping laptop or a long
 * pause cannot make a timer drift: the first tick after the tab is shown again is already right,
 * and focusing the window refreshes it at once. Nothing ticks while the tab is hidden.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(Date.now());
    const start = () => {
      tick();
      if (timer === null) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => (document.visibilityState === "visible" ? start() : stop());

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", tick);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);

  return now;
}
