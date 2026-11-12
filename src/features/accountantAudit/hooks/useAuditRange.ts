"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import {
  isRangeInverted,
  openingRange,
  parseAuditRange,
  withAuditRange,
  type AuditRange,
} from "../utils/auditRange";

/**
 * The date range of the Audit tab, kept in the URL as `from` and `to`. Reads it, writes the
 * opening range (This month) once when the URL has no range parameter at all, and writes every
 * change by `router.replace` (no history step), dropping `apage`.
 * docs/specs/accountant-audit-05-drivers-table.md §2.1 (D4, D12, D13, R8, R11, R20).
 */
export function useAuditRange(): {
  range: AuditRange;
  setRange: (next: AuditRange) => void;
  isInverted: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { range: urlRange, hasRangeParams } = parseAuditRange(searchParams);
  // Fixed for the life of the tab: only used until it is written into the URL.
  const opening = useMemo(() => openingRange(DateTime.now()), []);
  const range = hasRangeParams ? urlRange : opening;

  const write = (next: AuditRange) =>
    router.replace(
      `${pathname}?${withAuditRange(new URLSearchParams(searchParams.toString()), next)}`,
      { scroll: false },
    );

  // R8: a URL with no range parameter (a bare tab, or an old driver link, D13) gets the opening
  // range written in. A parameter that is present but empty is All time and is left alone.
  useEffect(() => {
    if (!hasRangeParams) write(opening);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRangeParams]);

  return { range, setRange: write, isInverted: isRangeInverted(range) };
}
