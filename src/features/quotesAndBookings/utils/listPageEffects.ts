import { filtersToSearchParams, type UrlSyncedListState } from "./filterUrlSync";
import {
  defaultSortForTab,
  tabUsesStatusFilter,
  type ListTab,
  type ListTabDeclaration,
} from "./listTabs";
import type { EventSort } from "./sortEvents";

/**
 * The decisions the list page's effects make, kept apart from the effects so they can be tested
 * without a DOM. `useListPageState` only wires them to the router and to React state.
 */

/** How long a state change waits before it is written to the URL, so typing is not a history write per key. */
const URL_WRITE_DEBOUNCE_MS = 300;

/**
 * The query string the URL should carry for this state, or null when it already does.
 * Parameters the list does not own (scorecard deep links, ...) are kept as they are.
 * An empty string is a real answer: the last synced parameter was cleared.
 */
export function queryStringToWrite(
  state: UrlSyncedListState,
  currentQuery: string,
  tabs: ListTabDeclaration,
): string | null {
  const nextQuery = filtersToSearchParams(
    state,
    tabs,
    new URLSearchParams(currentQuery),
  ).toString();
  return nextQuery === currentQuery ? null : nextQuery;
}

/** The first sync is immediate; every later one is debounced. */
export function urlWriteDelayMs(isFirstSync: boolean): number {
  return isFirstSync ? 0 : URL_WRITE_DEBOUNCE_MS;
}

/**
 * A new narrowing key is a new question for the list, so it is answered from page 1.
 * The same key leaves the page where it is.
 */
export function pageAfterChange(page: number, previousKey: string, currentKey: string): number {
  return previousKey === currentKey ? page : 1;
}

/**
 * Each tab opens on its own sort. A status filter the new tab does not offer is dropped, so it
 * cannot silently empty the table.
 */
export function tabSwitchOutcome(
  next: ListTab,
  hasStatusFilter: boolean,
  tabs: ListTabDeclaration,
): { sort: EventSort; dropStatuses: boolean } {
  return {
    sort: defaultSortForTab(next, tabs),
    dropStatuses: hasStatusFilter && !tabUsesStatusFilter(next, tabs),
  };
}
