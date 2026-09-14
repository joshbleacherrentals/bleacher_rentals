"use client";

import {
  PAGE_SIZE_OPTIONS,
  buildPageItems,
  getPageRange,
  getTotalPages,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";

type PaginationProps = {
  /** 1-based page currently shown. */
  page: number;
  pageSize: PageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
};

const buttonBase =
  "min-w-[32px] h-8 px-2 rounded border text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Google-style pager: numbered pages with Previous/Next, plus a rows-per-page
 * selector. Page state lives in the URL (see filterUrlSync), so this component
 * only reports what the user clicked.
 */
export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = getTotalPages(totalItems, pageSize);
  const { from, to } = getPageRange(page, pageSize, totalItems);
  const current = Math.min(Math.max(page, 1), totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="pageSize" className="sr-only">
          Rows per page
        </label>
        <select
          id="pageSize"
          name="pageSize"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          className="h-8 rounded border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
        <span>
          {from}–{to} of {totalItems}
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
            className={`${buttonBase} border-gray-300 bg-white hover:bg-gray-50`}
          >
            Prev
          </button>

          {buildPageItems(current, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-gray-400">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Go to page ${item}`}
                aria-current={item === current ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={`${buttonBase} ${
                  item === current
                    ? "border-darkBlue bg-darkBlue text-white"
                    : "border-gray-300 bg-white hover:bg-gray-50"
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Next page"
            disabled={current >= totalPages}
            onClick={() => onPageChange(current + 1)}
            className={`${buttonBase} border-gray-300 bg-white hover:bg-gray-50`}
          >
            Next
          </button>
        </div>
      )}
    </nav>
  );
}
