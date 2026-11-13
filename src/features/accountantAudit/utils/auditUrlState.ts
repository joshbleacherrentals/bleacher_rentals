import {
  parsePage,
  parsePageSize,
  DEFAULT_PAGE_SIZE,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";
import {
  AUDIT_SORT_KEYS,
  DEFAULT_AUDIT_SORT,
  type AuditSort,
  type AuditSortDirection,
  type AuditSortKey,
} from "./auditSort";

/**
 * URL state of the Audit tab. docs/specs/accountant-audit-02-driver-select.md §3 (D8, R6),
 * accountant-audit-04-table.md §3 (D6, R2) and accountant-audit-05-drivers-table.md §2.1
 * (D7, D21, R21). The range parameters (`from`, `to`) are in `auditRange.ts`.
 */
export const AUDIT_DRIVER_PARAM = "driver";
/** The tab's own page and page size, apart from the page-level `page` and `pageSize` (R2). */
export const AUDIT_PAGE_PARAM = "apage";
export const AUDIT_PAGE_SIZE_PARAM = "apagesize";
/** The drivers table's search text, sort key and sort direction (D7, D21, R21). */
export const AUDIT_SEARCH_PARAM = "asearch";
export const AUDIT_SORT_PARAM = "asort";
export const AUDIT_DIR_PARAM = "adir";

export function parseAuditDriver(searchParams: { get(key: string): string | null }): string | null {
  const value = searchParams.get(AUDIT_DRIVER_PARAM)?.trim();
  return value ? value : null;
}

/**
 * Sets or deletes `driver`, keeps every other parameter, returns the query string. A new driver
 * starts at page 1, so `apage` goes in the same write.
 */
export function withAuditDriver(current: URLSearchParams, driverUuid: string | null): string {
  const next = new URLSearchParams(current.toString());
  if (driverUuid) next.set(AUDIT_DRIVER_PARAM, driverUuid);
  else next.delete(AUDIT_DRIVER_PARAM);
  next.delete(AUDIT_PAGE_PARAM);
  return next.toString();
}

export function parseAuditPaging(searchParams: { get(key: string): string | null }): {
  page: number;
  pageSize: PageSize;
} {
  return {
    page: parsePage(searchParams.get(AUDIT_PAGE_PARAM)),
    pageSize: parsePageSize(searchParams.get(AUDIT_PAGE_SIZE_PARAM)),
  };
}

/** Writes the page and the size, keeps every other parameter. Page 1 and size 25 are left out. */
export function withAuditPaging(
  current: URLSearchParams,
  paging: { page: number; pageSize: PageSize },
): string {
  const next = new URLSearchParams(current.toString());
  if (paging.page > 1) next.set(AUDIT_PAGE_PARAM, String(paging.page));
  else next.delete(AUDIT_PAGE_PARAM);
  if (paging.pageSize !== DEFAULT_PAGE_SIZE) {
    next.set(AUDIT_PAGE_SIZE_PARAM, String(paging.pageSize));
  } else {
    next.delete(AUDIT_PAGE_SIZE_PARAM);
  }
  return next.toString();
}

/** The search text as it is in the URL (empty when absent). It is not trimmed: the box shows it. */
export function parseAuditSearch(searchParams: { get(key: string): string | null }): string {
  return searchParams.get(AUDIT_SEARCH_PARAM) ?? "";
}

/** Sets or deletes `asearch` (text that is only spaces deletes it), keeps every other parameter. */
export function withAuditSearch(current: URLSearchParams, text: string): string {
  const next = new URLSearchParams(current.toString());
  if (text.trim()) next.set(AUDIT_SEARCH_PARAM, text);
  else next.delete(AUDIT_SEARCH_PARAM);
  return next.toString();
}

/** R21: an unknown or missing value reads as the opening value of that parameter. */
export function parseAuditSort(searchParams: { get(key: string): string | null }): AuditSort {
  const key = searchParams.get(AUDIT_SORT_PARAM);
  const direction = searchParams.get(AUDIT_DIR_PARAM);
  return {
    key: (AUDIT_SORT_KEYS as readonly string[]).includes(key ?? "")
      ? (key as AuditSortKey)
      : DEFAULT_AUDIT_SORT.key,
    direction:
      direction === "asc" || direction === "desc"
        ? (direction as AuditSortDirection)
        : DEFAULT_AUDIT_SORT.direction,
  };
}

/** Writes `asort` and `adir`, deleting each one that equals the opening value (R21). */
export function withAuditSort(current: URLSearchParams, sort: AuditSort): string {
  const next = new URLSearchParams(current.toString());
  if (sort.key === DEFAULT_AUDIT_SORT.key) next.delete(AUDIT_SORT_PARAM);
  else next.set(AUDIT_SORT_PARAM, sort.key);
  if (sort.direction === DEFAULT_AUDIT_SORT.direction) next.delete(AUDIT_DIR_PARAM);
  else next.set(AUDIT_DIR_PARAM, sort.direction);
  return next.toString();
}
