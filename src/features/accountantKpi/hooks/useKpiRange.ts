"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import {
  isRangeInverted,
  openingRange,
  type AuditRange,
} from "@/features/accountantAudit/utils/auditRange";
import { parseKpiRange, withKpiRange } from "../utils/kpiRange";

/**
 * The date range of the KPI tab, kept in the URL as `kfrom` and `kto`. Reads it, writes the opening
 * range (This month) once when the URL has neither parameter, and writes every change by
 * `router.replace` (no history step). The same as `useAuditRange`, for the tab's own parameters.
 * docs/specs/accountant-kpi.md §2.2, §2.4 (D12, D13).
 */
export function useKpiRange(): {
  range: AuditRange;
  setRange: (next: AuditRange) => void;
  isInverted: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { range: urlRange, hasRangeParams } = parseKpiRange(searchParams);
  // Fixed for the life of the tab: only used until it is written into the URL.
  const opening = useMemo(() => openingRange(DateTime.now()), []);
  const range = hasRangeParams ? urlRange : opening;

  const write = (next: AuditRange) =>
    router.replace(
      `${pathname}?${withKpiRange(new URLSearchParams(searchParams.toString()), next)}`,
      { scroll: false },
    );

  // A URL with neither parameter gets the opening range written in. A parameter that is present
  // but empty is All time and is left alone.
  useEffect(() => {
    if (!hasRangeParams) write(opening);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRangeParams]);

  return { range, setRange: write, isInverted: isRangeInverted(range) };
}
