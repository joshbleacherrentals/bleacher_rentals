import { DEFAULT_PAGE_SIZE } from "./pagination";
import { filtersToSearchParams } from "./filterUrlSync";
import { inboundLeadsFilters } from "./inboundLeadsZones";
import { QUOTES_BOOKINGS_TABS } from "./listTabs";

/** The window event the quotes list listens for, to show the Inbound Leads template when it is open. */
export const SHOW_INBOUND_LEADS_EVENT = "quotes-list:show-inbound-leads";

/**
 * A link that opens the quotes list on the Inbound Leads template: unsent website quotes in the
 * given zones, oldest first. The list reads its filters from the URL when it opens.
 */
export function inboundLeadsHref(zoneUuids: string[]): string {
  const { isOpen: _isOpen, ...filters } = inboundLeadsFilters(zoneUuids);
  const params = filtersToSearchParams(
    {
      filters,
      searchQuery: "",
      showDeleted: false,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: { key: "created_at", direction: "asc" },
      tab: QUOTES_BOOKINGS_TABS.openingTab,
    },
    QUOTES_BOOKINGS_TABS,
  );
  return `/quotes-bookings?${params.toString()}`;
}
