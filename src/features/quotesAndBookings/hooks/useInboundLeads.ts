"use client";

import { useMemo } from "react";
import { oldestCreatedAtMs } from "../utils/oldestCreatedAt";
import { emptyFilters } from "./useQuotesAndBookingsFilters";
import { useInboundLeadsRule } from "./useInboundLeadsRule";
import { useQuotesAndBookingsData } from "./useQuotesAndBookingsData";

/**
 * The inbound leads waiting for this person: the rows the My Inbound Leads template shows, found
 * with the template's own rule. The pill's count and the header's wait timer both read it, so they
 * always speak about the rows the template shows. `oldestCreatedAtMs` is when the longest-waiting
 * one arrived. Nothing is counted until the rule can be applied.
 */
export function useInboundLeads(): {
  count: number;
  oldestCreatedAtMs: number | null;
  handlesLeads: boolean;
} {
  const { user, ready, handlesLeads } = useInboundLeadsRule();
  const { data } = useQuotesAndBookingsData(emptyFilters, false, ready ? user : null);

  return useMemo(() => {
    // Not ready: the rule is off, so `data` holds every event. It is not a count of anything.
    if (!ready || !data) return { count: 0, oldestCreatedAtMs: null, handlesLeads };
    return { count: data.length, oldestCreatedAtMs: oldestCreatedAtMs(data), handlesLeads };
  }, [data, ready, handlesLeads]);
}
