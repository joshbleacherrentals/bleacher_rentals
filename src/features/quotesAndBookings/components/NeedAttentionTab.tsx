"use client";

import { useMemo } from "react";
import { DataTable, Column, CellText, CellSecondary } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { TabsContent } from "@/components/ui/tabs";
import type { QuotesBookingsEvent } from "../types";
import { useNeedAttentionData } from "../hooks/useNeedAttentionData";
import { INVOICE_REASON_TEXT } from "../utils/invoiceAttention";
import { needAttentionRows, type NeedAttentionEvent } from "../utils/needAttentionRows";
import { searchEvents } from "../utils/searchEvents";
import { sortEvents, type EventSort, type SortKey } from "../utils/sortEvents";
import { clampPage, getTotalPages, slicePage, type PageSize } from "../utils/pagination";
import { EventNameCell, accountManagerName, formatListDate } from "./eventListCells";

/** Search, sort and paging are the page's state (so they live in the URL like the rest of the list). */
type ListControls = {
  searchQuery: string;
  sort: EventSort;
  onSort: (key: SortKey) => void;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  onRowClick: (event: QuotesBookingsEvent) => void;
};

/**
 * The content of the Need attention tab of /accountant: every quote whose QuickBooks invoice no
 * longer matches the quote, with the reasons. It is built from the page's list, so the Filter Panel
 * and Show Deleted narrow it as they narrow the AR tabs.
 * Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §4
 */
export function NeedAttentionTab({
  events,
  eventsLoading,
  ...controls
}: ListControls & {
  /** The page's list, already narrowed by the Filter Panel and Show Deleted. */
  events: QuotesBookingsEvent[] | undefined;
  eventsLoading: boolean;
}) {
  const { data, isLoading, error } = useNeedAttentionData();

  const rows = useMemo(
    () => (events && data ? needAttentionRows(events, data) : undefined),
    [events, data],
  );

  return (
    <TabsContent value="need_attention">
      {error ? (
        <div className="py-8 text-center text-red-500">Error loading invoices: {error.message}</div>
      ) : (
        <NeedAttentionTable rows={rows} isLoading={eventsLoading || isLoading} {...controls} />
      )}
    </TabsContent>
  );
}

function NeedAttentionTable({
  rows,
  isLoading,
  searchQuery,
  sort,
  onSort,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRowClick,
}: ListControls & {
  rows: NeedAttentionEvent[] | undefined;
  isLoading: boolean;
}) {
  const shown = useMemo(
    () => (rows ? sortEvents(searchEvents(rows, searchQuery), sort) : rows),
    [rows, searchQuery, sort],
  );

  const totalItems = shown?.length ?? 0;
  const currentPage = clampPage(page, getTotalPages(totalItems, pageSize));
  const pageData = useMemo(
    () => (shown ? slicePage(shown, currentPage, pageSize) : shown),
    [shown, currentPage, pageSize],
  );

  const columns: Column<NeedAttentionEvent>[] = [
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
      key: "reason",
      header: "Reason",
      render: (event) => (
        <CellText>
          {event.reasons.map((reason) => INVOICE_REASON_TEXT[reason].short).join(", ")}
        </CellText>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={pageData ?? null}
        keyExtractor={(event) => event.id}
        emptyMessage="No invoice needs attention"
        isLoading={isLoading}
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
