"use client";

import { useEffect, useMemo, useState } from "react";
import { msUntilNextDay, todayInZone } from "../utils/todayInZone";

/**
 * Today's date (YYYY-MM-DD) in `timezone`, kept current: a list left open
 * overnight moves to the new day at midnight instead of judging "due today"
 * by the day it was opened.
 *
 * A sleeping laptop can hold a timer back past midnight, so the date is also
 * re-read when the tab becomes visible again. Re-reading an unchanged day
 * returns the same string, so nothing downstream recomputes.
 */
export function useToday(timezone: string): string {
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshes((n) => n + 1);

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextDay(timezone));
    };
    schedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timezone]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `refreshes` only exists to re-read the clock
  return useMemo(() => todayInZone(timezone), [timezone, refreshes]);
}
