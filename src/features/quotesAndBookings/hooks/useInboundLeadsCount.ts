"use client";

import { useMemo } from "react";
import { inboundLeadsFilters } from "../utils/inboundLeadsZones";
import { useQuotesAndBookingsData } from "./useQuotesAndBookingsData";

/**
 * How many inbound leads are waiting for this person: website quotes not sent yet, in the given
 * zones. It uses the same filters as the Inbound Leads template, so it does not change with
 * whatever else is filtered on the page; it is the number the template would show.
 */
export function useInboundLeadsCount(zoneUuids: string[]): number {
  const filters = useMemo(() => inboundLeadsFilters(zoneUuids), [zoneUuids]);
  const { data } = useQuotesAndBookingsData(filters);
  return data?.length ?? 0;
}
