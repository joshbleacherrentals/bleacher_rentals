"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { PageSize } from "@/features/quotesAndBookings/utils/pagination";
import { buildAuditTrackerCountQuery, buildAuditTrackersQuery } from "../db/auditTrackers";
import type { AuditRange } from "../utils/auditRange";
import {
  clampPage,
  toAuditRow,
  type AuditTrackerResultRow,
  type AuditTrackerRow,
} from "../utils/auditRows";

type CountRow = { total: number };

/**
 * One page of a driver's work trackers inside a date range, with each one's Paid / Not paid, and
 * the total behind the pager. Two watchers per driver: the count and the page (R2).
 * docs/specs/accountant-audit-03-tracker-data.md §3; the range: accountant-audit-05 (D8, D15).
 */
export function useAuditTrackers(
  driverUuid: string | null,
  range: AuditRange,
  page: number,
  pageSize: PageSize,
): {
  rows: AuditTrackerRow[];
  total: number;
  page: number; // the effective page, after clampPage
  isLoading: boolean;
  error: Error | undefined;
} {
  const hasDriver = driverUuid !== null;

  const { from, to } = range;
  const countCompiled = useMemo(
    () => buildAuditTrackerCountQuery(driverUuid, { from, to }),
    [driverUuid, from, to],
  );
  const {
    data: countData,
    isLoading: countLoading,
    error: countError,
  } = useTypedQuery(countCompiled, expect<CountRow>());

  // Undefined while the count is loading; no driver means nothing to page (total 0).
  const total = hasDriver ? countData?.[0]?.total : 0;
  const effectivePage = clampPage(page, total, pageSize);

  const pageCompiled = useMemo(
    () => buildAuditTrackersQuery(driverUuid, { from, to }, effectivePage, pageSize),
    [driverUuid, from, to, effectivePage, pageSize],
  );
  const {
    data: pageData,
    isLoading: pageLoading,
    error: pageError,
  } = useTypedQuery(pageCompiled, expect<AuditTrackerResultRow>());

  const rows = useMemo(
    () => (hasDriver ? (pageData ?? []).map((row) => toAuditRow(row)) : []),
    [hasDriver, pageData],
  );

  return {
    rows,
    total: total ?? 0,
    page: effectivePage,
    isLoading: hasDriver && (countLoading || pageLoading),
    error: countError ?? pageError,
  };
}
