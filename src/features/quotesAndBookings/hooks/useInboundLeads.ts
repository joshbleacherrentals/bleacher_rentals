"use client";

import { useMemo } from "react";
import { inboundLeadsFilters } from "../utils/inboundLeadsZones";
import { oldestCreatedAtMs } from "../utils/oldestCreatedAt";
import { useQuotesAndBookingsData } from "./useQuotesAndBookingsData";

/**
 * The inbound leads waiting for this person: unsent website quotes in the given zones, found with
 * the Inbound Leads template's own filters. The template pill's count and the header's wait timer
 * both read it, so they always speak about the rows the template shows. `oldestCreatedAtMs` is
 * when the longest-waiting one arrived.
 */
export function useInboundLeads(zoneUuids: string[]): {
  count: number;
  oldestCreatedAtMs: number | null;
} {
  const filters = useMemo(() => inboundLeadsFilters(zoneUuids), [zoneUuids]);
  const { data } = useQuotesAndBookingsData(filters);
  return useMemo(
    () => ({ count: data?.length ?? 0, oldestCreatedAtMs: oldestCreatedAtMs(data ?? []) }),
    [data],
  );
}
