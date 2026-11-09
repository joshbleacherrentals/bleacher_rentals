"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuditDriverTotals } from "../hooks/useAuditDriverTotals";
import { filterAuditDriverRows, type AuditDriverRow } from "../utils/auditDriverRows";
import type { AuditRange } from "../utils/auditRange";
import { nextAuditSort, sortAuditDriverRows, type AuditSortKey } from "../utils/auditSort";
import {
  parseAuditSearch,
  parseAuditSort,
  withAuditDriver,
  withAuditSearch,
  withAuditSort,
} from "../utils/auditUrlState";
import { AuditDriversTable } from "./AuditDriversTable";
import { AuditRangeControls } from "./AuditRangeControls";
import { AuditSearchBar, SEARCH_WRITE_DELAY_MS, createDebouncer } from "./AuditSearchBar";

type Props = {
  range: AuditRange;
  onRangeChange: (range: AuditRange) => void;
  isInverted: boolean;
};

function Message({ children, alert }: { children: string; alert?: boolean }) {
  return (
    <div
      data-testid="audit-drivers-message"
      role={alert ? "alert" : undefined}
      className={`py-12 text-center text-sm ${alert ? "text-red-600" : "text-gray-500"}`}
    >
      {children}
    </div>
  );
}

/**
 * The list of the Audit tab (no `driver` in the URL): the search bar and the range controls above
 * the drivers table. The search filters the loaded rows at once and goes into the URL after a pause
 * (R6); the header click writes the sort (R21); a row opens the driver page (R5). No KPI cards, no
 * pager. docs/specs/accountant-audit-05-drivers-table.md §2.3.
 */
export function AuditDriversList({ range, onRangeChange, isInverted }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = parseAuditSort(searchParams);
  const urlText = parseAuditSearch(searchParams);
  const { rows, isLoading, error } = useAuditDriverTotals(range);

  // The box shows what was typed; the URL gets it after a pause.
  const [text, setText] = useState(urlText);
  const written = useRef(urlText); // the last text this list wrote, or read from the URL
  const currentParams = () => new URLSearchParams(searchParams.toString());

  const writeSearch = (next: string) => {
    written.current = next;
    router.replace(`${pathname}?${withAuditSearch(currentParams(), next)}`, { scroll: false });
  };
  const writeRef = useRef(writeSearch);
  writeRef.current = writeSearch;
  const debouncer = useMemo(
    () => createDebouncer((next) => writeRef.current(next), SEARCH_WRITE_DELAY_MS),
    [],
  );
  useEffect(() => () => debouncer.cancel(), [debouncer]);

  // Back or Forward put another text in the URL: show it.
  useEffect(() => {
    if (urlText !== written.current) {
      written.current = urlText;
      setText(urlText);
    }
  }, [urlText]);

  const handleSearch = (next: string) => {
    setText(next);
    debouncer.schedule(next);
  };

  const handleSort = (key: AuditSortKey) =>
    router.replace(`${pathname}?${withAuditSort(currentParams(), nextAuditSort(sort, key))}`, {
      scroll: false,
    });

  // D9, R5: the driver page keeps every parameter, the latest typed text included, and starts at
  // its page 1.
  const getRowHref = (row: AuditDriverRow) =>
    `${pathname}?${withAuditDriver(
      new URLSearchParams(withAuditSearch(currentParams(), text)),
      row.driverUuid,
    )}`;

  const visible = useMemo(
    () => sortAuditDriverRows(filterAuditDriverRows(rows, text), sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, text, sort.key, sort.direction],
  );

  let body;
  if (isInverted) {
    body = <Message alert>The start date is after the end date.</Message>;
  } else if (error) {
    body = <Message alert>Could not load the drivers.</Message>;
  } else if (isLoading) {
    body = <Message>Loading drivers...</Message>;
  } else {
    body = (
      <AuditDriversTable
        rows={visible}
        sort={sort}
        onSort={handleSort}
        getRowHref={getRowHref}
        emptyMessage={rows.length === 0 ? "No driver data for this range." : "No driver found."}
      />
    );
  }

  return (
    <div data-testid="audit-drivers-list">
      <div className="flex flex-wrap items-center gap-3">
        <AuditSearchBar value={text} onChange={handleSearch} />
        <AuditRangeControls range={range} onChange={onRangeChange} />
      </div>
      <div className="mt-5">{body}</div>
    </div>
  );
}
