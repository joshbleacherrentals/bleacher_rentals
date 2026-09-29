import { DEFAULT_SORT, type EventSort } from "./sortEvents";

/**
 * The tabs above the /quotes-bookings list. "all" is the list as it always was;
 * the two AR tabs narrow it to booked events with money due, split by whether
 * the event has started (see `accountsReceivable.ts`).
 */
export const LIST_TABS = ["all", "ar", "ar_deposits"] as const;

export type ListTab = (typeof LIST_TABS)[number];

export type ReceivablesTab = Exclude<ListTab, "all">;

/** Reads ?tab= back; anything missing or unknown is the plain list. */
export function parseListTab(raw: string | null): ListTab {
  return LIST_TABS.find((tab) => tab === raw) ?? "all";
}

/**
 * Each AR tab opens on the event closest to today: AR walks back from today
 * into the past, AR Deposits walks forward from tomorrow.
 */
const DEFAULT_SORT_BY_TAB: Record<ListTab, EventSort> = {
  all: DEFAULT_SORT,
  ar: { key: "start_date", direction: "desc" },
  ar_deposits: { key: "start_date", direction: "asc" },
};

export function defaultSortForTab(tab: ListTab): EventSort {
  return DEFAULT_SORT_BY_TAB[tab];
}

/**
 * Status is only a question on All Events: the AR tabs hold booked events and
 * nothing else, so a status filter there could only ever empty them. The page
 * hides the control on those tabs and drops any status carried into them.
 */
export function tabUsesStatusFilter(tab: ListTab): boolean {
  return tab === "all";
}
