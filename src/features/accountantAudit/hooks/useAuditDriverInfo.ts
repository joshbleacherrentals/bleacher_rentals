"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildAuditDriverInfoQuery,
  toAuditDriverInfo,
  type AuditDriverInfo,
  type AuditDriverInfoRow,
} from "../db/auditDriverInfo";

/**
 * The details of the driver in the URL, and whether that driver's answer has come yet.
 *
 * `isLoading` is true until the query has answered FOR THIS DRIVER. A reactive query keeps its old
 * result, with `isLoading` false and `isFetching` true, for a moment after its parameters change.
 * A click on a row of the drivers table is exactly that: `driver` goes from nothing to an id, and
 * the old result is the empty one of the query for "no driver". Read as "no row", it made the tab
 * take the driver for unknown and remove it from the URL at once. So an answer counts only when it
 * is a row of this driver, or the query is neither loading nor fetching.
 * docs/specs/accountant-audit-05-drivers-table.md R14, §10.
 */
export function useAuditDriverInfo(driverUuid: string | null): {
  info: AuditDriverInfo | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => buildAuditDriverInfoQuery(driverUuid).compile(), [driverUuid]);
  const { data, isLoading, isFetching } = useTypedQuery(compiled, expect<AuditDriverInfoRow>());

  const row = driverUuid ? data?.find((r) => r.id === driverUuid) : undefined;
  const info = useMemo(() => (row ? toAuditDriverInfo(row) : null), [row]);

  return { info, isLoading: driverUuid !== null && !row && (isLoading || isFetching) };
}
