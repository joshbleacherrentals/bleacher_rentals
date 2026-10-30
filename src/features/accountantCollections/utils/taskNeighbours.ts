import type { CollectionsListState } from "./collectionsListState";
import type { CollectionsRow } from "./collectionsRows";
import { filterCollectionsRows, sortCollectionsRows } from "./collectionsSort";

/**
 * The neighbours of an event in the Collections list, for Previous Task and Next Task. Pure: the
 * order is the list's own (`filterCollectionsRows` then `sortCollectionsRows`), so the two cannot
 * disagree. docs/specs/accountant-collections-10-prev-next.md §3.
 */

export function orderedEventIds(
  rows: readonly CollectionsRow[],
  listState: CollectionsListState,
  today: string,
): string[] {
  return sortCollectionsRows(filterCollectionsRows(rows, listState, today), listState).map(
    (row) => row.eventId,
  );
}

export type TaskNeighbours = {
  /** False when `currentId` is not in `ids`; both neighbours are then null. */
  found: boolean;
  previousId: string | null;
  nextId: string | null;
};

export function neighboursOf(ids: readonly string[], currentId: string): TaskNeighbours {
  const index = ids.indexOf(currentId);
  if (index === -1) return { found: false, previousId: null, nextId: null };
  return {
    found: true,
    previousId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}
