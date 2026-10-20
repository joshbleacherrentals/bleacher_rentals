"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  bucketAndSortVenueEvents,
  venueEventsQuery,
  type VenueEventBuckets,
  type VenueEventRow,
} from "../db/fetchVenueEvents";

const NO_EVENTS: VenueEventBuckets = { past: [], future: [] };

/**
 * The events held at one venue, split into Past and Future, for the Venue history panel. Watched,
 * so the lists change when an event is edited, created or deleted while the panel is open. Spec:
 * docs/specs/quote-detail-03-history-panels.md.
 *
 * - `buckets` is null until the query has answered; `isLoading` is true over the same time.
 * - A failed read gives empty lists, as the one-time fetch's `catch` did.
 * - "Past" is decided against the time of the render that buckets the rows.
 */
export function useVenueEvents(venueId: string): {
  buckets: VenueEventBuckets | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => venueEventsQuery(venueId), [venueId]);
  const { data, isLoading, error } = useTypedQuery(compiled, expect<VenueEventRow>());

  const buckets = useMemo(() => {
    if (error) return NO_EVENTS;
    if (isLoading) return null;
    return bucketAndSortVenueEvents(data ?? []);
  }, [data, isLoading, error]);

  return { buckets, isLoading: !error && isLoading };
}
