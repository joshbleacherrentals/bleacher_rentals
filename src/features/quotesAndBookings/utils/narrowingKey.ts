import type { QuotesBookingsFilters } from "../types";
import type { EventSort } from "./sortEvents";
import type { ListTab } from "./listTabs";

/**
 * Identifies "the question the list is answering". When it changes, the list is
 * a different result set, so the page goes back to 1.
 *
 * `isOpen` is left out on purpose: it only shows or hides the filter sidebar and
 * does not change which rows match, so toggling it must not move the pagination.
 */
export function narrowingKey(
  filters: QuotesBookingsFilters,
  searchQuery: string,
  showDeleted: boolean,
  sort: EventSort,
  activeTab: ListTab,
): string {
  const { isOpen: _isOpen, ...appliedFilters } = filters;
  return JSON.stringify([appliedFilters, searchQuery, showDeleted, sort, activeTab]);
}
