"use client";

import { useState } from "react";
import type { CollectionsListState } from "../utils/collectionsListState";
import { neighboursOf, orderedEventIds } from "../utils/taskNeighbours";
import { useCollectionsData } from "./useCollectionsData";

/**
 * The events before and after this one in the Collections list, fixed when the invoice page opens.
 * The list is reactive and a completed task leaves it, so the neighbours are computed once per
 * event, from the first load, and later data changes do not touch them. Next.js keeps this
 * component when only `?id=` changes, hence the key. docs/specs/accountant-collections-10-prev-next.md §3.
 */

type Frozen = { eventId: string; previousId: string | null; nextId: string | null };

export function useTaskNeighbours({
  eventId,
  listState,
}: {
  eventId: string;
  listState: CollectionsListState;
}): { isReady: boolean; previousId: string | null; nextId: string | null } {
  const { rows, isLoading, today } = useCollectionsData();
  const [frozen, setFrozen] = useState<Frozen | null>(null);

  let current = frozen?.eventId === eventId ? frozen : null;
  if (!current && !isLoading) {
    const { previousId, nextId } = neighboursOf(orderedEventIds(rows, listState, today), eventId);
    current = { eventId, previousId, nextId };
    // Set during render, which React allows for state derived from props: it re-runs at once.
    setFrozen(current);
  }

  if (!current) return { isReady: false, previousId: null, nextId: null };
  return { isReady: true, previousId: current.previousId, nextId: current.nextId };
}
