"use client";
import { useState, useCallback, useEffect } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/Pagination";
import { useLayoutContext } from "@/contexts/LayoutContexts";
import { FilterButton } from "@/features/quotesAndBookings/components/FilterButton";
import {
  FilterSidebar,
  countActiveFilters,
} from "@/features/quotesAndBookings/components/FilterSidebar";
import { AccountsReceivableTabs } from "@/features/quotesAndBookings/components/AccountsReceivableTabs";
import { ActiveFilterChips } from "@/features/quotesAndBookings/components/ActiveFilterChips";
import { useListPageState } from "@/features/quotesAndBookings/hooks/useListPageState";
import { useQuotesAndBookingsData } from "@/features/quotesAndBookings/hooks/useQuotesAndBookingsData";
import { useOfficeCurrencies } from "@/features/quotesAndBookings/hooks/useOfficeCurrencies";
import type { QuotesBookingsEvent } from "@/features/quotesAndBookings/types";
import { pickEventCurrency } from "@/features/quotesAndBookings/utils/eventCurrency";
import {
  ACCOUNTANT_TABS,
  parseListTab,
  tabUsesStatusFilter,
} from "@/features/quotesAndBookings/utils/listTabs";
import { RECEIVABLES_HELP } from "@/features/quotesAndBookings/utils/receivablesHelp";
import { nextSort } from "@/features/quotesAndBookings/utils/sortEvents";

/**
 * The Accountant page: the AR and AR Deposits tabs, taken out of /quotes-bookings.
 * docs/specs/accountant-quotes-02-accountant-page.md
 */
export default function AccountantPage() {
  const router = useRouter();
  const { scrollRef } = useLayoutContext();

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
  } = useListPageState(ACCOUNTANT_TABS);

  // The sidebar is pinned inside the scrolling layout and fills the visible height, so its
  // contents scroll rather than the whole page.
  const [sidebarHeight, setSidebarHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setSidebarHeight(Math.max(240, el.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);

  const { data, isLoading, error } = useQuotesAndBookingsData(filters, showDeleted);

  const goToPage = useCallback(
    (next: number) => {
      setPage(next);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setPage, scrollRef],
  );

  // Money columns are per-office: a quote out of a Canadian office is shown in
  // C$, and the column totals keep the two currencies apart.
  const { currencyByOfficeId } = useOfficeCurrencies();
  const currencyOf = useCallback(
    (event: QuotesBookingsEvent) => pickEventCurrency(event.sales_office_uuid, currencyByOfficeId),
    [currencyByOfficeId],
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Error loading events: {error.message}</div>
      </div>
    );
  }

  // -m-4 cancels the accountant layout's p-4 so the filter sidebar sits flush against the app
  // sidebar, header and window edge; the content column puts its own padding back.
  return (
    <div className="-m-4 flex items-start">
      <FilterSidebar
        filters={filters}
        isOpen={filters.isOpen}
        onToggle={toggleOpen}
        height={sidebarHeight}
        showStatus={tabUsesStatusFilter(activeTab, ACCOUNTANT_TABS)}
        onStatusesChange={setStatuses}
        onCreatedRangeChange={setCreatedRange}
        onEventRangeChange={setEventRange}
        onBookedRangeChange={setBookedRange}
        onInGoodShuffleChange={setInGoodShuffle}
        onInQuickBooksChange={setInQuickBooks}
        onSalesOfficeChange={setSalesOfficeUuid}
        onAccountManagerChange={setAccountManagerUserUuid}
        onClear={clearFilters}
      />
      {/* min-w-0 lets this column shrink below the table's width, so the table scrolls sideways
          instead of pushing the page (and the sidebar) wider. */}
      <main className="min-w-0 flex-1 p-4">
        <PageHeader
          title="Accountant"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={showDeleted}
                onClick={() => setShowDeleted((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none"
              >
                <span>Show Deleted</span>
                <span
                  className={`relative inline-flex h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 ${
                    showDeleted ? "bg-darkBlue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-[2px] ${
                      showDeleted ? "translate-x-[20px]" : "translate-x-[2px]"
                    }`}
                  />
                </span>
              </button>
              {!filters.isOpen && (
                <FilterButton
                  isOpen={false}
                  onClick={toggleOpen}
                  activeCount={countActiveFilters(filters)}
                />
              )}
            </div>
          }
        />

        <div className="relative mt-4 mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, invoice #, manager, date, amount due, remaining balance, contact, company..."
            className="w-full h-[40px] pl-10 pr-4 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          />
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => switchTab(parseListTab(value, ACCOUNTANT_TABS))}
        >
          {/* Tabs left, applied filters right. The chips scroll sideways rather
              than wrap, and drop to their own line when the row gets narrow. */}
          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="shrink-0">
              <TabsTrigger value="ar">
                AR
                <InfoTooltip
                  label="About the AR tab"
                  content={RECEIVABLES_HELP.ar}
                  focusable={false}
                />
              </TabsTrigger>
              <TabsTrigger value="ar_deposits">
                AR Deposits
                <InfoTooltip
                  label="About the AR Deposits tab"
                  content={RECEIVABLES_HELP.arDeposits}
                  focusable={false}
                />
              </TabsTrigger>
            </TabsList>
            <ActiveFilterChips
              filters={filters}
              searchQuery={searchQuery}
              showDeleted={showDeleted}
              showStatus={tabUsesStatusFilter(activeTab, ACCOUNTANT_TABS)}
              onRemove={removeFilter}
              onClearAll={clearAllFilters}
            />
          </div>

          {/* Always mounted: the payment queries and the allocation run once for both tabs. */}
          <AccountsReceivableTabs
            events={data}
            eventsLoading={isLoading}
            searchQuery={searchQuery}
            sort={sort}
            onSort={(key) => setSort((current) => nextSort(current, key))}
            page={page}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            currencyOf={currencyOf}
            onRowClick={(event) => router.push(`/quotes-bookings/${event.id}`)}
          />
        </Tabs>
      </main>
    </div>
  );
}
