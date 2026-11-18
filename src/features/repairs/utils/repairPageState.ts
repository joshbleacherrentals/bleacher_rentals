import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  getTotalPages,
  parsePage,
  parsePageSize,
  slicePage,
  type PageSize,
} from "@/features/quotesAndBookings/utils/pagination";
import type { CurrencyTotals, RepairListRow, RepairTab } from "./repairRows";
import { splitByTab, totalsByCurrency } from "./repairTabs";

/**
 * The state of the Repairs page that lives in the URL, and the pure function that turns the whole
 * list into the page shown: bleacher filter, tab split, totals and one slice.
 * docs/specs/repairs-04-table.md §2.6, §2.8 and §3 (the signatures here are locked by that spec).
 */

const PARAM = {
  tab: "tab",
  page: "page",
  pageSize: "pageSize",
  bleacher: "bleacher_uuid",
} as const;

export type RepairsUrlState = {
  tab: RepairTab;
  page: number; // 1-based
  pageSize: PageSize; // 25 | 50 | 100
  bleacherUuid: string | null;
};

/** Anything but `?tab=completed` is the Open tab; a bad page is 1; a size not offered is 25. */
export function readRepairsUrlState(params: { get(key: string): string | null }): RepairsUrlState {
  return {
    tab: params.get(PARAM.tab) === "completed" ? "completed" : "open",
    page: parsePage(params.get(PARAM.page)),
    pageSize: parsePageSize(params.get(PARAM.pageSize)),
    bleacherUuid: params.get(PARAM.bleacher) || null,
  };
}

/** The query string for this state. A default value is not written; other parameters are kept. */
export function writeRepairsUrlState(
  state: RepairsUrlState,
  existing: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(existing.toString());
  const setOrDelete = (key: string, value: string | null) => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  };
  setOrDelete(PARAM.tab, state.tab === "completed" ? "completed" : null);
  setOrDelete(PARAM.page, state.page > 1 ? String(state.page) : null);
  setOrDelete(PARAM.pageSize, state.pageSize !== DEFAULT_PAGE_SIZE ? String(state.pageSize) : null);
  setOrDelete(PARAM.bleacher, state.bleacherUuid);
  return params;
}

/**
 * Any change except a bare page change is a new question for the list, so it starts from page 1
 * (the rule of the Quotes & Bookings list). An empty patch is Show Deleted switched on or off.
 */
export function narrowRepairsUrlState(
  state: RepairsUrlState,
  patch: Partial<Pick<RepairsUrlState, "tab" | "pageSize" | "bleacherUuid">>,
): RepairsUrlState {
  return {
    tab: patch.tab ?? state.tab,
    pageSize: patch.pageSize ?? state.pageSize,
    bleacherUuid: patch.bleacherUuid === undefined ? state.bleacherUuid : patch.bleacherUuid,
    page: 1,
  };
}

/**
 * The repairs whose bleachers (the junction, spec 03 D29) contain the chosen one. They still carry
 * all their bleachers. No bleacher keeps every row.
 */
export function filterByBleacher(
  rows: readonly RepairListRow[],
  bleacherUuid: string | null,
): RepairListRow[] {
  if (!bleacherUuid) return [...rows];
  return rows.filter((row) => row.bleachers.some((b) => b.uuid === bleacherUuid));
}

export type RepairsView = {
  tabRows: RepairListRow[]; // rows of the tab that pass the filter, in the hook's order
  pageRows: RepairListRow[]; // the page shown
  totals: CurrencyTotals; // of tabRows
  totalItems: number; // tabRows.length
  currentPage: number; // the page in the URL clamped into 1..pages
};

export function buildRepairsView(
  rows: readonly RepairListRow[],
  state: RepairsUrlState,
): RepairsView {
  const tabRows = splitByTab(filterByBleacher(rows, state.bleacherUuid))[state.tab];
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
