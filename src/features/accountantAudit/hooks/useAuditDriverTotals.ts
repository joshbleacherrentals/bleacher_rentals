"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { buildAuditDriverTotalsQuery } from "../db/auditDriverTotals";
import {
  toAuditDriverRows,
  type AuditDriverRow,
  type AuditDriverTotalsResultRow,
} from "../utils/auditDriverRows";
import { isRangeInverted, type AuditRange } from "../utils/auditRange";

/**
 * Every driver with at least one tracker in the range, with the four totals and the driver's
 * currency, not sorted (R23). One local watcher (R16).
 * An inverted range (From after To) shows no rows and is never loading or failed (R9): the hook
 * still calls the query, since a hook cannot be skipped, but its SQL matches nothing and its
 * result is not read.
 * docs/specs/accountant-audit-05-drivers-table.md §2.1.
 */
export function useAuditDriverTotals(range: AuditRange): {
  rows: AuditDriverRow[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const { from, to } = range;
  const inverted = isRangeInverted(range);
  const compiled = useMemo(() => buildAuditDriverTotalsQuery({ from, to }).compile(), [from, to]);
  const { data, isLoading, error } = useTypedQuery(compiled, expect<AuditDriverTotalsResultRow>());
  const rows = useMemo(() => (inverted ? [] : toAuditDriverRows(data ?? [])), [inverted, data]);
  return {
    rows,
    isLoading: inverted ? false : isLoading,
    error: inverted ? undefined : error,
  };
}
