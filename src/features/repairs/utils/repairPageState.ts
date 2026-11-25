import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  getTotalPages,
  parsePage,
  parsePageSize,
  slicePage,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";
import { filterRepairs } from "./repairFilters";
import type { CurrencyTotals, RepairListRow, RepairTab } from "./repairRows";
import { parseRepairSort, serializeRepairSort, sortRepairs, type RepairSort } from "./repairSort";
import { splitByTab, totalsByCurrency } from "./repairTabs";

/**
 * The state of the Repairs page that lives in the URL, and the pure function that turns the whole
 * list into the page shown: search and filters, sort, tab split, totals and one slice.
 * docs/specs/repairs-04-table.md §2.6, §2.8 and §3, changed by docs/specs/repairs-05-toolbar.md
 * §2.7 and §3 (the signatures here are locked by those specs).
 */

const PARAM = {
  tab: "tab",
  page: "page",
  pageSize: "pageSize",
  search: "q",
  bleachers: "bleachers",
  zones: "zones",
  vendors: "vendors",
  categories: "categories",
  sort: "sort",
  showDeleted: "showDeleted",
  /** The one-bleacher parameter of spec 04. It is still read (D63) and never written again. */
  legacyBleacher: "bleacher_uuid",
} as const;

export type RepairsUrlState = {
  tab: RepairTab;
  page: number; // 1-based
  pageSize: PageSize; // 25 | 50 | 100
  search: string; // as typed; "" = none
  bleacherUuids: string[];
  zoneUuids: string[];
  vendorUuids: string[];
  categoryUuids: string[];
  sort: RepairSort | null; // null = the starting order
  showDeleted: boolean; // as in the address; the page honours it only for a role that may
};

export type RepairsUrlPatch = Partial<Omit<RepairsUrlState, "page">>;

/** Uuids split on commas; empty items and repeats are dropped and the order is kept. */
function readList(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const item of raw.split(",")) {
    const value = item.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Anything but `?tab=completed` is the Open tab; a bad page is 1; a size not offered is 25. The old
 * `bleacher_uuid` is one ticked bleacher, unless `bleachers` has a value, which wins (D63).
 */
export function readRepairsUrlState(params: { get(key: string): string | null }): RepairsUrlState {
  const bleachers = readList(params.get(PARAM.bleachers));
  const legacy = params.get(PARAM.legacyBleacher)?.trim();
  return {
    tab: params.get(PARAM.tab) === "completed" ? "completed" : "open",
    page: parsePage(params.get(PARAM.page)),
    pageSize: parsePageSize(params.get(PARAM.pageSize)),
    search: params.get(PARAM.search) ?? "",
    bleacherUuids: bleachers.length > 0 ? bleachers : legacy ? [legacy] : [],
    zoneUuids: readList(params.get(PARAM.zones)),
    vendorUuids: readList(params.get(PARAM.vendors)),
    categoryUuids: readList(params.get(PARAM.categories)),
    sort: parseRepairSort(params.get(PARAM.sort)),
    showDeleted: params.get(PARAM.showDeleted) === "1",
  };
}

/**
 * The query string for this state. A default value is not written; other parameters are kept; the
 * old `bleacher_uuid` is always removed. A search text of only spaces is not written, and any other
 * is written as typed (a trailing space must survive the round trip).
 */
export function writeRepairsUrlState(
  state: RepairsUrlState,
  existing: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(existing.toString());
  const setOrDelete = (key: string, value: string | null) => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  };
  const list = (values: readonly string[]) => (values.length > 0 ? values.join(",") : null);

  setOrDelete(PARAM.tab, state.tab === "completed" ? "completed" : null);
  setOrDelete(PARAM.page, state.page > 1 ? String(state.page) : null);
  setOrDelete(PARAM.pageSize, state.pageSize !== DEFAULT_PAGE_SIZE ? String(state.pageSize) : null);
  setOrDelete(PARAM.search, state.search.trim() === "" ? null : state.search);
  setOrDelete(PARAM.bleachers, list(state.bleacherUuids));
  setOrDelete(PARAM.zones, list(state.zoneUuids));
  setOrDelete(PARAM.vendors, list(state.vendorUuids));
  setOrDelete(PARAM.categories, list(state.categoryUuids));
  setOrDelete(PARAM.sort, serializeRepairSort(state.sort));
  setOrDelete(PARAM.showDeleted, state.showDeleted ? "1" : null);
  params.delete(PARAM.legacyBleacher);
  return params;
}

/** Whether any of the four filters (Bleacher, Zone, Vendor, Category) has a ticked value (D237). */
export function hasActiveFilters(state: {
  bleacherUuids: readonly string[];
  zoneUuids: readonly string[];
  vendorUuids: readonly string[];
  categoryUuids: readonly string[];
}): boolean {
  return (
    state.bleacherUuids.length > 0 ||
    state.zoneUuids.length > 0 ||
    state.vendorUuids.length > 0 ||
    state.categoryUuids.length > 0
  );
}

/**
 * The patch of "Clear All Filters" (D237): the four filters empty. The search, the tab, the sort,
 * the page size and Show Deleted are not filters and are kept.
 */
export const CLEAR_FILTERS_PATCH: RepairsUrlPatch = {
  bleacherUuids: [],
  zoneUuids: [],
  vendorUuids: [],
  categoryUuids: [],
};

/**
 * Any change except a bare page change is a new question for the list, so it starts from page 1
 * (the rule of the Quotes & Bookings list). The patch names what changes; the rest is kept. An
 * empty patch changes nothing but the page.
 */
export function narrowRepairsUrlState(
  state: RepairsUrlState,
  patch: RepairsUrlPatch,
): RepairsUrlState {
  return {
    tab: patch.tab ?? state.tab,
    pageSize: patch.pageSize ?? state.pageSize,
    search: patch.search ?? state.search,
    bleacherUuids: patch.bleacherUuids ?? state.bleacherUuids,
    zoneUuids: patch.zoneUuids ?? state.zoneUuids,
    vendorUuids: patch.vendorUuids ?? state.vendorUuids,
    categoryUuids: patch.categoryUuids ?? state.categoryUuids,
    sort: patch.sort === undefined ? state.sort : patch.sort,
    showDeleted: patch.showDeleted ?? state.showDeleted,
    page: 1,
  };
}

export type RepairsView = {
  tabRows: RepairListRow[]; // rows of the tab that pass the search and the filters, in sort order
  pageRows: RepairListRow[]; // the page shown
  totals: CurrencyTotals; // of tabRows
  totalItems: number; // tabRows.length
  currentPage: number; // the page in the URL clamped into 1..pages
};

/** Search and filters, then the sort, then the tab split, the totals and one page. */
export function buildRepairsView(
  rows: readonly RepairListRow[],
  state: RepairsUrlState,
): RepairsView {
  const narrowed = filterRepairs(rows, {
    search: state.search,
    bleacherUuids: state.bleacherUuids,
    zoneUuids: state.zoneUuids,
    vendorUuids: state.vendorUuids,
    categoryUuids: state.categoryUuids,
  });
  const tabRows = splitByTab(sortRepairs(narrowed, state.sort))[state.tab];
  const totalItems = tabRows.length;
  const currentPage = clampPage(state.page, getTotalPages(totalItems, state.pageSize));
  return {
    tabRows,
    pageRows: slicePage(tabRows, currentPage, state.pageSize),
    totals: totalsByCurrency(tabRows),
    totalItems,
    currentPage,
  };
}
