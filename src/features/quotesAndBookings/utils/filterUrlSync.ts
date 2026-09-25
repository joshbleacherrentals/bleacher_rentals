import type { QuotesBookingsFilters } from "../types";
import { DEFAULT_PAGE_SIZE, parsePage, parsePageSize, type PageSize } from "./pagination";
import { parseSort, serializeSort, type EventSort } from "./sortEvents";

/**
 * Query-param keys the /quotes-bookings list page owns for filter state.
 * Kept separate from scorecard deep-link params (template, timeRange,
 * accountManager, periodStart) and the isOpen UI flag, which are never
 * written back to the URL.
 */
const PARAM = {
  statuses: "statuses",
  createdFrom: "createdFrom",
  createdTo: "createdTo",
  eventFrom: "eventFrom",
  eventTo: "eventTo",
  bookedFrom: "bookedFrom",
  bookedTo: "bookedTo",
  accountManagerUserUuid: "am",
  inGoodShuffle: "goodShuffle",
  inQuickBooks: "quickBooks",
  salesOfficeUuid: "office",
  search: "q",
  showDeleted: "showDeleted",
  page: "page",
  pageSize: "pageSize",
  sort: "sort",
} as const;

export type UrlSyncedListState = {
  filters: Omit<QuotesBookingsFilters, "isOpen">;
  searchQuery: string;
  showDeleted: boolean;
  /** 1-based page number. Page 1 is the default and stays out of the URL. */
  page: number;
  pageSize: PageSize;
  /** Newest-created-first is the default and stays out of the URL. */
  sort: EventSort;
};

function boolToParam(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "1" : "0";
}

function paramToBool(value: string | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

/**
 * Builds a URLSearchParams with the filter/search/showDeleted state written
 * in, preserving any other params already present (e.g. scorecard deep-link
 * params, or the quote detail tab param on other pages).
 */
export function filtersToSearchParams(
  state: UrlSyncedListState,
  existingParams?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(existingParams?.toString());
  const { filters, searchQuery, showDeleted, page, pageSize, sort } = state;

  const setOrDelete = (key: string, value: string | null) => {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  };

  setOrDelete(PARAM.statuses, filters.statuses.length > 0 ? filters.statuses.join(",") : null);
  setOrDelete(PARAM.createdFrom, filters.createdFrom);
  setOrDelete(PARAM.createdTo, filters.createdTo);
  setOrDelete(PARAM.eventFrom, filters.eventFrom);
  setOrDelete(PARAM.eventTo, filters.eventTo);
  setOrDelete(PARAM.bookedFrom, filters.bookedFrom);
  setOrDelete(PARAM.bookedTo, filters.bookedTo);
  setOrDelete(PARAM.accountManagerUserUuid, filters.accountManagerUserUuid);
  setOrDelete(PARAM.inGoodShuffle, boolToParam(filters.inGoodShuffle));
  setOrDelete(PARAM.inQuickBooks, boolToParam(filters.inQuickBooks));
  setOrDelete(PARAM.salesOfficeUuid, filters.salesOfficeUuid);
  setOrDelete(PARAM.search, searchQuery || null);
  setOrDelete(PARAM.showDeleted, showDeleted ? "1" : null);
  setOrDelete(PARAM.page, page > 1 ? String(page) : null);
  setOrDelete(PARAM.pageSize, pageSize !== DEFAULT_PAGE_SIZE ? String(pageSize) : null);
  setOrDelete(PARAM.sort, serializeSort(sort));

  return params;
}

/**
 * Reads filter/search/showDeleted state back out of URL search params.
 * Any param that's absent/invalid falls back to its empty-filter default.
 */
export function searchParamsToFilters(searchParams: {
  get(key: string): string | null;
}): UrlSyncedListState {
  const statusesParam = searchParams.get(PARAM.statuses);
  return {
    filters: {
      statuses: statusesParam ? statusesParam.split(",").filter(Boolean) : [],
      createdFrom: searchParams.get(PARAM.createdFrom),
      createdTo: searchParams.get(PARAM.createdTo),
      eventFrom: searchParams.get(PARAM.eventFrom),
      eventTo: searchParams.get(PARAM.eventTo),
      bookedFrom: searchParams.get(PARAM.bookedFrom),
      bookedTo: searchParams.get(PARAM.bookedTo),
      accountManagerUserUuid: searchParams.get(PARAM.accountManagerUserUuid),
      inGoodShuffle: paramToBool(searchParams.get(PARAM.inGoodShuffle)),
      inQuickBooks: paramToBool(searchParams.get(PARAM.inQuickBooks)),
      salesOfficeUuid: searchParams.get(PARAM.salesOfficeUuid),
    },
    searchQuery: searchParams.get(PARAM.search) ?? "",
    showDeleted: paramToBool(searchParams.get(PARAM.showDeleted)) ?? false,
    page: parsePage(searchParams.get(PARAM.page)),
    pageSize: parsePageSize(searchParams.get(PARAM.pageSize)),
    sort: parseSort(searchParams.get(PARAM.sort)),
  };
}

/** True if any filter/search/showDeleted param this module owns is present in the URL. */
export function hasUrlSyncedFilterParams(searchParams: {
  get(key: string): string | null;
}): boolean {
  return Object.values(PARAM).some((key) => searchParams.get(key) !== null);
}

/**
 * True if any actual FilterPanel field is set — excludes searchQuery and
 * showDeleted, which live in the URL too but shouldn't force the filter
 * panel open on their own.
 */
export function hasActiveFilterValues(filters: Omit<QuotesBookingsFilters, "isOpen">): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.createdFrom !== null ||
    filters.createdTo !== null ||
    filters.eventFrom !== null ||
    filters.eventTo !== null ||
    filters.bookedFrom !== null ||
    filters.bookedTo !== null ||
    filters.accountManagerUserUuid !== null ||
    filters.inGoodShuffle !== null ||
    filters.inQuickBooks !== null ||
    filters.salesOfficeUuid !== null
  );
}
