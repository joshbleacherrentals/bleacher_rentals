"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseWeekParam } from "../utils/selectedWeek";

/**
 * The selected week lives in the address (`?week=<Monday>`), so it stays when the tab changes and
 * survives a reload. Returns the week's Monday and a setter that swaps it in place.
 */
export function useSelectedWeek(): [string, (weekStart: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekStart = parseWeekParam(searchParams.get("week"));

  const setWeekStart = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("week", next);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return [weekStart, setWeekStart];
}
