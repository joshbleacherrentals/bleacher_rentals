"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseWeekParam } from "@/features/scheduleValidator/utils/selectedWeek";

/**
 * The selected zone and week live in the address (`?zone=<id>&week=<Monday>`), so they stay when the
 * tab changes and survive a reload. The zone is empty until one is chosen; a missing week means the
 * current one.
 */
export function useZoneWeekParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const zoneId = searchParams.get("zone") ?? "";
  const weekStart = parseWeekParam(searchParams.get("week"));

  const setParam = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(name, value);
      else params.delete(name);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return {
    zoneId,
    weekStart,
    setZoneId: useCallback((value: string) => setParam("zone", value), [setParam]),
    setWeekStart: useCallback((value: string) => setParam("week", value), [setParam]),
  };
}
