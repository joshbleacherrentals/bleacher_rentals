"use client";

import { useMemo } from "react";
import { DataTable, Column, CellText, CellSecondary } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { TabsContent } from "@/components/ui/tabs";
import type { AccountsReceivableEvent, QuotesBookingsEvent } from "../types";
import type { Currency } from "../types/quoteTypes";
import { useAccountsReceivableData } from "../hooks/useAccountsReceivableData";
import { searchReceivables } from "../utils/searchEvents";
import { sortEvents, type EventSort, type SortKey } from "../utils/sortEvents";
import { clampPage, getTotalPages, slicePage, type PageSize } from "../utils/pagination";
import { formatTotalsLabel, sumByCurrency } from "../utils/eventCurrency";
import { formatMoney } from "../utils/formatMoney";
import type { ReceivablesTab } from "../utils/listTabs";
import { EventNameCell, accountManagerName, formatListDate } from "./eventListCells";

const RECEIVABLES_TABS: readonly ReceivablesTab[] = ["ar", "ar_deposits"];

/** Search, sort and paging are the page's state (so they live in the URL like the rest of the list). */
type ListControls = {
  searchQuery: string;
  sort: EventSort;
  onSort: (key: SortKey) => void;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  currencyOf: (event: QuotesBookingsEvent) => Currency;
  onRowClick: (event: AccountsReceivableEvent) => void;
};

/**
 * The content of the AR and AR Deposits tabs.
 *
 * The page mounts this the first time an AR tab is opened and keeps it from
 * then on, so the payment queries and the allocation in
 * `useAccountsReceivableData` run once for both tabs — not again on every tab
 * switch. Radix still renders only the open tab's table.
 */
export function AccountsReceivableTabs({
  events,
  eventsLoading,
  ...controls
}: ListControls & {
  /** The page's list, already narrowed by the Filter Panel and Show Deleted. */
  events: QuotesBookingsEvent[] | undefined;
  eventsLoading: boolean;
}) {
  const { data, isLoading, error } = useAccountsReceivableData(events, controls.currencyOf);

  return RECEIVABLES_TABS.map((tab) => (
    <TabsContent key={tab} value={tab}>
      {error ? (
        <div className="py-8 text-center text-red-500">Error loading balances: {error.message}</div>
      ) : (
        <ReceivablesTable
          tab={tab}
          rows={data?.[tab]}
          isLoading={eventsLoading || isLoading}
          {...controls}
        />
      )}
    </TabsContent>
  ));
}

function ReceivablesTable({
  tab,
  rows,
  isLoading,
  searchQuery,
  sort,
  onSort,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  currencyOf,
  onRowClick,
}: ListControls & {
  tab: ReceivablesTab;
  rows: AccountsReceivableEvent[] | undefined;
  isLoading: boolean;
}) {
  const shown = useMemo(
    () => (rows ? sortEvents(searchReceivables(rows, searchQuery, currencyOf), sort) : rows),
    [rows, searchQuery, currencyOf, sort],
  );

  const totalItems = shown?.length ?? 0;
  const currentPage = clampPage(page, getTotalPages(totalItems, pageSize));
  const pageData = useMemo(
    () => (shown ? slicePage(shown, currentPage, pageSize) : shown),
    [shown, currentPage, pageSize],
  );

  const columns: Column<AccountsReceivableEvent>[] = [
    {
      key: "event_name",
      header: `Event Name (${totalItems})`,
      sortKey: "event_name",
      render: (event) => <EventNameCell event={event} />,
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
      key: "invoice_number",
      header: "Invoice #",
      sortKey: "invoice_number",
      render: (event) => (
        <CellSecondary>{event.invoice_number ? `#${event.invoice_number}` : "—"}</CellSecondary>
      ),
    },
    {
      key: "amount_due",
      header: formatTotalsLabel(
        "Amount Due",
        sumByCurrency(shown, (e) => e.amount_due_cents, currencyOf),
      ),
      align: "right",
      sortKey: "amount_due",
      render: (event) => (
        <CellText bold>{formatMoney(event.amount_due_cents, currencyOf(event))}</CellText>
      ),
    },
    {
      key: "remaining_balance",
      header: formatTotalsLabel(
        "Remaining Balance",
        sumByCurrency(shown, (e) => e.remaining_balance_cents, currencyOf),
      ),
      align: "right",
      sortKey: "remaining_balance",
      render: (event) => (
        <CellText>{formatMoney(event.remaining_balance_cents, currencyOf(event))}</CellText>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={pageData ?? null}
        keyExtractor={(event) => event.id}
        emptyMessage={tab === "ar" ? "Nothing is due on past events" : "No deposits are due"}
        isLoading={isLoading}
        loadingMessage="Loading balances..."
        onRowClick={onRowClick}
        sort={sort}
        onSort={(key) => onSort(key as SortKey)}
      />

      {!isLoading && totalItems > 0 && (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </>
  );
}
