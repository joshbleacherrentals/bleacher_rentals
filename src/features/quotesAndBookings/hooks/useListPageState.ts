"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QuotesBookingsFilters } from "../types";
import { useQuotesAndBookingsFilters } from "./useQuotesAndBookingsFilters";
import type { ActiveFilterKey } from "../utils/activeFilters";
import { searchParamsToFilters, hasUrlSyncedFilterParams } from "../utils/filterUrlSync";
import type { ListTab } from "../utils/listTabs";
import { narrowingKey } from "../utils/narrowingKey";
import type { PageSize } from "../utils/pagination";
import type { EventSort } from "../utils/sortEvents";
import {
  pageAfterChange,
  queryStringToWrite,
  tabSwitchOutcome,
  urlWriteDelayMs,
} from "../utils/listPageEffects";

/**
 * The state of a quotes list page — filters, search, page, page size, sort, tab and Show Deleted —
 * and its round trip through the URL. Data loading and layout stay with the page.
 */
export function useListPageState(initialOverrides?: Partial<QuotesBookingsFilters>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filters/search/showDeleted round-trip through the URL so the browser
  // back button restores them (e.g. after clicking into a quote). Read once
  // on mount — subsequent user edits are pushed back out via the effect below.
  // eslint/exhaustive-deps note: intentionally read once on mount, not on every
  // searchParams change (that would fight the sync effect below).
  const urlState = useMemo(() => searchParamsToFilters(searchParams), []);
  const hasUrlFilters = useMemo(() => hasUrlSyncedFilterParams(searchParams), []);

  const {
    filters,
    toggleOpen,
    setStatuses,
    setCreatedRange,
    setEventRange,
    setBookedRange,
    setAccountManagerUserUuid,
    setInGoodShuffle,
    setInQuickBooks,
    setSalesOfficeUuid,
    clearFilter,
    clearFilters,
  } = useQuotesAndBookingsFilters(initialOverrides, hasUrlFilters ? urlState.filters : undefined);

  const [showDeleted, setShowDeleted] = useState(urlState.showDeleted);
  const [searchQuery, setSearchQuery] = useState(urlState.searchQuery);
  const [page, setPage] = useState(urlState.page);
  const [pageSize, setPageSize] = useState<PageSize>(urlState.pageSize);
  const [sort, setSort] = useState<EventSort>(urlState.sort);
  const [activeTab, setActiveTab] = useState<ListTab>(urlState.tab);

  // Each tab opens on its own default order (AR tabs: nearest event first).
  // Filters, search and Show Deleted carry over — they narrow every tab alike —
  // except Status, which the AR tabs do not offer: a status picked on All Events
  // is dropped on the way in, so it cannot silently empty an AR table.
  const switchTab = (next: ListTab) => {
    const outcome = tabSwitchOutcome(next, filters.statuses.length > 0);
    setActiveTab(next);
    setSort(outcome.sort);
    if (outcome.dropStatuses) setStatuses([]);
  };

  // The applied-filter chips: one clears its own filter, "Clear all" clears
  // every filter, the search box and Show Deleted.
  const removeFilter = (key: ActiveFilterKey) => {
    if (key === "search") setSearchQuery("");
    else if (key === "showDeleted") setShowDeleted(false);
    else clearFilter(key);
  };
  const clearAllFilters = () => {
    clearFilters();
    setSearchQuery("");
    setShowDeleted(false);
  };

  // A new filter/search is a new question: answer it from page 1, the way a
  // search engine does. Without this, narrowing a 9-page list while sitting on
  // page 8 would land on an empty table.
  // A new sort order or tab starts from the top as well.
  // Opening/closing the filter sidebar is not a new question, so it is not part of the key.
  const currentNarrowingKey = narrowingKey(filters, searchQuery, showDeleted, sort, activeTab);
  const lastNarrowingKeyRef = useRef(currentNarrowingKey);
  useEffect(() => {
    const previousKey = lastNarrowingKeyRef.current;
    lastNarrowingKeyRef.current = currentNarrowingKey;
    setPage((current) => pageAfterChange(current, previousKey, currentNarrowingKey));
  }, [currentNarrowingKey]);

  // Push filter/search/showDeleted state into the URL (replace, not push, so
  // each edit doesn't grow browser history — only "open a quote" should).
  // Search is debounced so we're not replacing history on every keystroke.
  const isFirstSyncRef = useRef(true);
  useEffect(() => {
    const delay = urlWriteDelayMs(isFirstSyncRef.current);
    isFirstSyncRef.current = false;
    const timeout = setTimeout(() => {
      const nextQs = queryStringToWrite(
        { filters, searchQuery, showDeleted, page, pageSize, sort, tab: activeTab },
        searchParams.toString(),
      );
      if (nextQs === null) return;
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });
    }, delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchQuery, showDeleted, page, pageSize, sort, activeTab]);

  return {
    filters,
    toggleOpen,
    setStatuses,
    setCreatedRange,
    setEventRange,
    setBookedRange,
    setAccountManagerUserUuid,
    setInGoodShuffle,
    setInQuickBooks,
    setSalesOfficeUuid,
    clearFilter,
    clearFilters,
    showDeleted,
    setShowDeleted,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    setPageSize,
    sort,
    setSort,
    activeTab,
    switchTab,
    removeFilter,
    clearAllFilters,
  };
}
