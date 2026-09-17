/**
 * Client-side pagination for the /quotes-bookings list.
 *
 * The whole filtered list already lives in memory (PowerSync syncs it
 * locally), so paging is a slice, not a query. What matters here is that the
 * page and page size survive a reload: both are URL params, so hitting F5 on
 * page 8 lands back on page 8 instead of page 1.
 */

/** Page sizes offered in the selector. Anything else is not representable. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** Reads ?pageSize= back, falling back to the default for any unoffered value. */
export function parsePageSize(raw: string | null): PageSize {
  const parsed = Number(raw);
  const match = PAGE_SIZE_OPTIONS.find((size) => size === parsed);
  return match ?? DEFAULT_PAGE_SIZE;
}

/** Reads ?page= back as a 1-based page number; anything invalid means page 1. */
export function parsePage(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

/** Page count for a list; always at least 1 so the pager reads "1 of 1" when empty. */
export function getTotalPages(totalItems: number, pageSize: number): number {
  if (totalItems <= 0) return 1;
  return Math.ceil(totalItems / pageSize);
}

/** Clamps a page into [1, totalPages] — the URL can name a page that no longer exists. */
export function clampPage(page: number, totalPages: number): number {
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

/** The rows of `items` shown on `page`, clamped when the page is out of range. */
export function slicePage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const current = clampPage(page, getTotalPages(items.length, pageSize));
  const start = (current - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** A rendered pager slot: a page number, or a "…" standing for skipped pages. */
export type PageItem = number | "gap";

/** How many pages stay visible on each side of the current one. */
const SIBLING_COUNT = 2;

/**
 * Google-style pager slots: a fixed-width window around the current page, with
 * page 1 and the last page always reachable in one click. A gap is only used
 * when it actually hides more than one page.
 */
export function buildPageItems(currentPage: number, totalPages: number): PageItem[] {
  const current = clampPage(currentPage, totalPages);
  const windowSize = SIBLING_COUNT * 2 + 1;

  let start = Math.max(1, current - SIBLING_COUNT);
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const items: PageItem[] = [];

  if (start > 1) {
    items.push(1);
    if (start === 3) items.push(2);
    else if (start > 3) items.push("gap");
  }

  for (let page = start; page <= end; page++) items.push(page);

  if (end < totalPages) {
    if (end === totalPages - 2) items.push(totalPages - 1);
    else if (end < totalPages - 2) items.push("gap");
    items.push(totalPages);
  }

  return items;
}

/** The 1-based row range shown on `page`, for the "Showing 26–50 of 213" label. */
export function getPageRange(
  page: number,
  pageSize: number,
  totalItems: number,
): { from: number; to: number } {
  if (totalItems <= 0) return { from: 0, to: 0 };
  const current = clampPage(page, getTotalPages(totalItems, pageSize));
  const from = (current - 1) * pageSize + 1;
  return { from, to: Math.min(current * pageSize, totalItems) };
}
