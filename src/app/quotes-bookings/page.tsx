"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { DataTable, Column, CellText, CellSecondary, CellBadge } from "@/components/DataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterButton } from "@/features/quotesAndBookings/components/FilterButton";
import {
  FilterSidebar,
  countActiveFilters,
} from "@/features/quotesAndBookings/components/FilterSidebar";
import { useQuotesAndBookingsFilters } from "@/features/quotesAndBookings/hooks/useQuotesAndBookingsFilters";
import { useQuotesAndBookingsData } from "@/features/quotesAndBookings/hooks/useQuotesAndBookingsData";
import { narrowingKey } from "@/features/quotesAndBookings/utils/narrowingKey";

import type { QuotesBookingsEvent } from "@/features/quotesAndBookings/types";
import { searchEvents } from "@/features/quotesAndBookings/utils/searchEvents";
import {
  sortEvents,
  nextSort,
  type EventSort,
  type SortKey,
} from "@/features/quotesAndBookings/utils/sortEvents";
import { eventSubtotalCents, eventTaxCents } from "@/features/quotesAndBookings/utils/eventAmounts";
import {
  pickEventCurrency,
  sumByCurrency,
  formatTotalsLabel,
} from "@/features/quotesAndBookings/utils/eventCurrency";
import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import { useOfficeCurrencies } from "@/features/quotesAndBookings/hooks/useOfficeCurrencies";
import {
  EventNameCell,
  accountManagerName,
  formatListDate,
} from "@/features/quotesAndBookings/components/eventListCells";
import { AccountsReceivableTabs } from "@/features/quotesAndBookings/components/AccountsReceivableTabs";
import { ActiveFilterChips } from "@/features/quotesAndBookings/components/ActiveFilterChips";
import type { ActiveFilterKey } from "@/features/quotesAndBookings/utils/activeFilters";
import {
  defaultSortForTab,
  parseListTab,
  tabUsesStatusFilter,
  type ListTab,
} from "@/features/quotesAndBookings/utils/listTabs";
import {
  isScorecardTemplate,
  filtersForTemplate,
  SCORECARD_TEMPLATES,
} from "@/features/quotesAndBookings/utils/scorecardTemplates";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/Pagination";
import { useLayoutContext } from "@/contexts/LayoutContexts";
import {
  clampPage,
  getTotalPages,
  slicePage,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";
import {
  filtersToSearchParams,
  searchParamsToFilters,
  hasUrlSyncedFilterParams,
} from "@/features/quotesAndBookings/utils/filterUrlSync";

function getStatusVariant(status: string | null): "success" | "warning" | "error" | "default" {
  switch (status?.toLowerCase()) {
    case "booked":
      return "success";
    case "quoted":
      return "warning";
    case "lost":
      return "error";
    default:
      return "default";
  }
}

function capitalizeStatus(status: string | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export default function QuotesBookingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { scrollRef } = useLayoutContext();

  // Filters/search/showDeleted round-trip through the URL so the browser
  // back button restores them (e.g. after clicking into a quote). Read once
  // on mount — subsequent user edits are pushed back out via the effect below.
  // eslint/exhaustive-deps note: intentionally read once on mount, not on every
  // searchParams change (that would fight the sync effect below).
  const urlState = useMemo(() => searchParamsToFilters(searchParams), []);
  const hasUrlFilters = useMemo(() => hasUrlSyncedFilterParams(searchParams), []);

  const templateParam = searchParams.get("template");
  const timeRangeParam = searchParams.get("timeRange") as
    | "weekly"
    | "quarterly"
    | "annually"
    | null;

  const accountManagerParam = searchParams.get("accountManager");
  const periodStartParam = searchParams.get("periodStart");
  const activeTemplate = isScorecardTemplate(templateParam) ? templateParam : null;

  const initialOverrides = useMemo(() => {
    if (!activeTemplate || !timeRangeParam) return undefined;
    return filtersForTemplate(
      activeTemplate,
      timeRangeParam,
      "this",
      accountManagerParam,
      periodStartParam,
    );
  }, [activeTemplate, timeRangeParam, accountManagerParam, periodStartParam]);

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

  const [showDeleted, setShowDeleted] = useState(urlState.showDeleted);
  const { data, isLoading, error } = useQuotesAndBookingsData(filters, showDeleted);
  const [searchQuery, setSearchQuery] = useState(urlState.searchQuery);
  const [page, setPage] = useState(urlState.page);
  const [pageSize, setPageSize] = useState<PageSize>(urlState.pageSize);
  const [sort, setSort] = useState<EventSort>(urlState.sort);
  const [activeTab, setActiveTab] = useState<ListTab>(urlState.tab);
  // The AR balances are worked out the first time an AR tab is opened and kept
  // from then on, so flipping between tabs never re-runs their queries.
  const [receivablesOpened, setReceivablesOpened] = useState(urlState.tab !== "all");

  // Each tab opens on its own default order (AR tabs: nearest event first).
  // Filters, search and Show Deleted carry over — they narrow every tab alike —
  // except Status, which the AR tabs do not offer: a status picked on All Events
  // is dropped on the way in, so it cannot silently empty an AR table.
  const switchTab = (next: ListTab) => {
    setActiveTab(next);
    setSort(defaultSortForTab(next));
    if (next !== "all") setReceivablesOpened(true);
    if (!tabUsesStatusFilter(next) && filters.statuses.length > 0) setStatuses([]);
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
    if (lastNarrowingKeyRef.current === currentNarrowingKey) return;
    lastNarrowingKeyRef.current = currentNarrowingKey;
    setPage(1);
  }, [currentNarrowingKey]);

  // Push filter/search/showDeleted state into the URL (replace, not push, so
  // each edit doesn't grow browser history — only "open a quote" should).
  // Search is debounced so we're not replacing history on every keystroke.
  const isFirstSyncRef = useRef(true);
  useEffect(() => {
    const delay = isFirstSyncRef.current ? 0 : 300;
    isFirstSyncRef.current = false;
    const timeout = setTimeout(() => {
      const nextParams = filtersToSearchParams(
        { filters, searchQuery, showDeleted, page, pageSize, sort, tab: activeTab },
        new URLSearchParams(searchParams.toString()),
      );
      const nextQs = nextParams.toString();
      const currentQs = searchParams.toString();
      if (nextQs === currentQs) return;
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });
    }, delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchQuery, showDeleted, page, pageSize, sort, activeTab]);

  // Only while All Events is open: on the AR tabs this sort over the whole list
  // would be work nobody sees, redone on every tab switch.
  const searchedData = useMemo(() => {
    if (!data || activeTab !== "all") return undefined;
    return sortEvents(searchEvents(data, searchQuery), sort);
  }, [data, searchQuery, sort, activeTab]);

  // The whole filtered list is already in memory (PowerSync), so a page is a
  // slice of it. The totals in the column headers stay whole-list on purpose.
  const totalItems = searchedData?.length ?? 0;
  const currentPage = clampPage(page, getTotalPages(totalItems, pageSize));
  const pageData = useMemo(
    () => (searchedData ? slicePage(searchedData, currentPage, pageSize) : searchedData),
    [searchedData, currentPage, pageSize],
  );

  const goToPage = useCallback(
    (next: number) => {
      setPage(next);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [scrollRef],
  );

  // Money columns are per-office: a quote out of a Canadian office is shown in
  // C$, and the column totals keep the two currencies apart.
  const { currencyByOfficeId } = useOfficeCurrencies();
  const currencyOf = useCallback(
    (event: QuotesBookingsEvent) => pickEventCurrency(event.sales_office_uuid, currencyByOfficeId),
    [currencyByOfficeId],
  );

  const periodLabel =
    timeRangeParam === "quarterly"
      ? "this quarter"
      : timeRangeParam === "annually"
        ? "this year"
        : "this week";

  const columns: Column<QuotesBookingsEvent>[] = [
    {
      key: "event_name",
      header: `Event Name (${searchedData?.length ?? 0})`,
      sortKey: "event_name",
      render: (event) => <EventNameCell event={event} />,
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      render: (event) =>
        event.deleted === 1 ? (
          <CellBadge variant="error">Deleted</CellBadge>
        ) : (
          <CellBadge variant={getStatusVariant(event.event_status)}>
            {capitalizeStatus(event.event_status)}
          </CellBadge>
        ),
    },
    {
      key: "account_manager",
      header: "Account Manager",
      sortKey: "account_manager",
      render: (event) => <CellText>{accountManagerName(event)}</CellText>,
    },
    {
      key: "start_date",
      header: "Start Date",
      sortKey: "start_date",
      render: (event) => <CellSecondary>{formatListDate(event.event_start)}</CellSecondary>,
    },
    {
      key: "end_date",
      header: "Booked",
      sortKey: "booked_at",
      render: (event) => (
        <CellSecondary>{event.booked_at ? formatListDate(event.booked_at) : "—"}</CellSecondary>
      ),
    },
    {
      key: "created_at",
      header: "Created At",
      sortKey: "created_at",
      render: (event) => <CellSecondary>{formatListDate(event.created_at)}</CellSecondary>,
    },
    {
      key: "subtotal",
      header: formatTotalsLabel(
        "Subtotal",
        sumByCurrency(searchedData, eventSubtotalCents, currencyOf),
      ),
      align: "right",
      sortKey: "subtotal",
      render: (event) => (
        <CellText bold>{formatMoney(eventSubtotalCents(event), currencyOf(event))}</CellText>
      ),
    },
    {
      key: "tax",
      header: formatTotalsLabel("Tax", sumByCurrency(searchedData, eventTaxCents, currencyOf)),
      align: "right",
      sortKey: "tax",
      render: (event) => (
        <CellText bold>{formatMoney(eventTaxCents(event), currencyOf(event))}</CellText>
      ),
    },
  ];

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Error loading events: {error.message}</div>
      </div>
    );
  }

  // -m-4 cancels the quotes-bookings layout's p-4 so the filter sidebar sits flush against the app
  // sidebar, header and window edge; the content column puts its own padding back.
  return (
    <div className="-m-4 flex items-start">
      <FilterSidebar
        filters={filters}
        isOpen={filters.isOpen}
        onToggle={toggleOpen}
        height={sidebarHeight}
        showStatus={tabUsesStatusFilter(activeTab)}
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
          title="Quotes & Bookings"
          subtitle="View all events — click a column header to sort"
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
              <PrimaryButton
                // Prefilling lives on /quotes-bookings/new itself, so typing the URL or refreshing
                // gets the same starting point as this button.
                onClick={() => router.push("/quotes-bookings/new")}
              >
                + Create Quote
              </PrimaryButton>
            </div>
          }
        />

        {activeTemplate && (
          <div className="mt-4 rounded-md bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">
                  Scorecard: {SCORECARD_TEMPLATES[activeTemplate].label}
                </span>
                <span className="text-indigo-600 ml-1">({periodLabel})</span>
              </div>
              <button
                onClick={() =>
                  router.push("/scorecard" + (timeRangeParam ? `?timeRange=${timeRangeParam}` : ""))
                }
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Scorecard
              </button>
            </div>
            <p className="mt-1 text-indigo-700">
              {SCORECARD_TEMPLATES[activeTemplate].description}
            </p>
          </div>
        )}

        <div className="relative mt-4 mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "all"
                ? "Search by name, invoice #, manager, date, amount, address, contact, company..."
                : "Search by name, invoice #, manager, date, amount due, remaining balance, contact, company..."
            }
            className="w-full h-[40px] pl-10 pr-4 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(value) => switchTab(parseListTab(value))}>
          {/* Tabs left, applied filters right. The chips scroll sideways rather
              than wrap, and drop to their own line when the row gets narrow. */}
          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="shrink-0">
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="ar">AR</TabsTrigger>
              <TabsTrigger value="ar_deposits">AR Deposits</TabsTrigger>
            </TabsList>
            <ActiveFilterChips
              filters={filters}
              searchQuery={searchQuery}
              showDeleted={showDeleted}
              tab={activeTab}
              onRemove={removeFilter}
              onClearAll={clearAllFilters}
            />
          </div>

          <TabsContent value="all">
            <DataTable
              columns={columns}
              data={pageData ?? null}
              keyExtractor={(event) => event.id}
              emptyMessage="No events found"
              isLoading={isLoading}
              loadingMessage="Loading events..."
              onRowClick={(event) => router.push(`/quotes-bookings/${event.id}`)}
              sort={sort}
              onSort={(key) => setSort((current) => nextSort(current, key as SortKey))}
            />

            {!isLoading && totalItems > 0 && (
              <Pagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={goToPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            )}
          </TabsContent>

          {/* Not mounted until an AR tab is first opened, so All Events never
              queries payments; kept after that, so tab switches reuse the result. */}
          {receivablesOpened && (
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
          )}
        </Tabs>
      </main>
    </div>
  );
}
