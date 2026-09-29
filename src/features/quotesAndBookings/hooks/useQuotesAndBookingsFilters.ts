"use client";

import { useCallback, useState } from "react";
import { QuotesBookingsFilters } from "../types";
import { hasActiveFilterValues } from "../utils/filterUrlSync";
import { withoutFilter, type ActiveFilterKey } from "../utils/activeFilters";

const emptyFilters: QuotesBookingsFilters = {
  isOpen: false,
  statuses: [],
  createdFrom: null,
  createdTo: null,
  eventFrom: null,
  eventTo: null,
  bookedFrom: null,
  bookedTo: null,
  accountManagerUserUuid: null,
  inGoodShuffle: null,
  inQuickBooks: null,
  salesOfficeUuid: null,
};

export function useQuotesAndBookingsFilters(
  initialOverrides?: Partial<QuotesBookingsFilters>,
  initialFromUrl?: Partial<QuotesBookingsFilters>,
) {
  const [filters, setFilters] = useState<QuotesBookingsFilters>(() => {
    if (initialFromUrl) {
      const merged = { ...emptyFilters, ...initialFromUrl };
      return { ...merged, isOpen: hasActiveFilterValues(merged) };
    }
    if (!initialOverrides) return emptyFilters;
    return { ...emptyFilters, ...initialOverrides, isOpen: true };
  });

  const toggleOpen = useCallback(() => {
    setFilters((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  const setStatuses = useCallback((statuses: string[]) => {
    setFilters((prev) => ({ ...prev, statuses }));
  }, []);

  const setCreatedRange = useCallback((from: string | null, to: string | null) => {
    setFilters((prev) => ({ ...prev, createdFrom: from, createdTo: to }));
  }, []);

  const setEventRange = useCallback((from: string | null, to: string | null) => {
    setFilters((prev) => ({ ...prev, eventFrom: from, eventTo: to }));
  }, []);

  const setBookedRange = useCallback((from: string | null, to: string | null) => {
    setFilters((prev) => ({ ...prev, bookedFrom: from, bookedTo: to }));
  }, []);

  const setAccountManagerUserUuid = useCallback((uuid: string | null) => {
    setFilters((prev) => ({ ...prev, accountManagerUserUuid: uuid }));
  }, []);

  const setInGoodShuffle = useCallback((value: boolean | null) => {
    setFilters((prev) => ({ ...prev, inGoodShuffle: value }));
  }, []);

  const setInQuickBooks = useCallback((value: boolean | null) => {
    setFilters((prev) => ({ ...prev, inQuickBooks: value }));
  }, []);

  const setSalesOfficeUuid = useCallback((uuid: string | null) => {
    setFilters((prev) => ({ ...prev, salesOfficeUuid: uuid }));
  }, []);

  /** Clears the one filter behind an applied-filter chip. */
  const clearFilter = useCallback((key: ActiveFilterKey) => {
    setFilters((prev) => withoutFilter(prev, key));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      statuses: [],
      createdFrom: null,
      createdTo: null,
      eventFrom: null,
      eventTo: null,
      bookedFrom: null,
      bookedTo: null,
      accountManagerUserUuid: null,
      inGoodShuffle: null,
      inQuickBooks: null,
      salesOfficeUuid: null,
    }));
  }, []);

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
  };
}
