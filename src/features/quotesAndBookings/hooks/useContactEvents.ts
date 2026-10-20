"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  bucketAndSortContactEvents,
  contactEventsQuery,
  type ContactEventBuckets,
  type ContactEventRow,
} from "../db/fetchContactEvents";

const NO_EVENTS: ContactEventBuckets = { past: [], future: [] };

/**
 * The events of one contact, split into Past and Future, for the Contact history panel. Watched,
 * so the lists change when an event is edited, created or deleted while the panel is open. Spec:
 * docs/specs/quote-detail-03-history-panels.md.
 *
 * - `buckets` is null until the query has answered; `isLoading` is true over the same time.
 * - A failed read gives empty lists, as the one-time fetch's `catch` did.
 * - "Past" is decided against the time of the render that buckets the rows.
 */
export function useContactEvents(contactId: string): {
  buckets: ContactEventBuckets | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => contactEventsQuery(contactId), [contactId]);
  const { data, isLoading, error } = useTypedQuery(compiled, expect<ContactEventRow>());

  const buckets = useMemo(() => {
    if (error) return NO_EVENTS;
    if (isLoading) return null;
    return bucketAndSortContactEvents(data ?? [], contactId);
  }, [data, isLoading, error, contactId]);

  return { buckets, isLoading: !error && isLoading };
}
