import {
  parsePage,
  parsePageSize,
  DEFAULT_PAGE_SIZE,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";

/**
 * URL state of the Audit tab. docs/specs/accountant-audit-02-driver-select.md §3 (D8, R6) and
 * accountant-audit-04-table.md §3 (D6, R2).
 */
export const AUDIT_DRIVER_PARAM = "driver";
/** The tab's own page and page size, apart from the page-level `page` and `pageSize` (R2). */
export const AUDIT_PAGE_PARAM = "apage";
export const AUDIT_PAGE_SIZE_PARAM = "apagesize";

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
