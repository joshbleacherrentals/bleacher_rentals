import { DEFAULT_SORT, type EventSort } from "./sortEvents";

/**
 * The tabs of a quotes list page. Each page declares its own — the list state hook and the URL
 * code read the declaration and know nothing about which tabs exist.
 */

/** The id of a tab, as it appears in `?tab=`. */
export type ListTab = string;

export type ListTabConfig = {
  id: ListTab;
  /** The order the tab opens on; also what the URL leaves out. */
  startingSort: EventSort;
  /** Whether the Status filter is offered on this tab. */
  offersStatus: boolean;
};

export type ListTabDeclaration = {
  tabs: readonly ListTabConfig[];
  /** Used when `?tab` is missing or unknown. */
  openingTab: ListTab;
  writeTabToUrl: boolean;
};

/**
 * /quotes-bookings: All Events, as it always was. One tab, no tab bar, `?tab` is never read or
 * written — a stale `?tab=ar` from an old bookmark opens All Events and is dropped on the first
 * write.
 */
export const QUOTES_BOOKINGS_TABS: ListTabDeclaration = {
  tabs: [{ id: "all", startingSort: DEFAULT_SORT, offersStatus: true }],
  openingTab: "all",
  writeTabToUrl: false,
};

/**
 * /accountant: the two AR tabs narrow the list to booked events with money due, split by whether
 * the event has started (see `accountsReceivable.ts`). Each opens on the event closest to today:
 * AR walks back from today into the past, AR Deposits walks forward from tomorrow. They hold
 * booked events by definition, so Status is not offered.
 */
export const ACCOUNTANT_TABS: ListTabDeclaration = {
  tabs: [
    { id: "ar", startingSort: { key: "start_date", direction: "desc" }, offersStatus: false },
    {
      id: "ar_deposits",
      startingSort: { key: "start_date", direction: "asc" },
      offersStatus: false,
    },
  ],
  openingTab: "ar",
  writeTabToUrl: true,
};

export type ReceivablesTab = "ar" | "ar_deposits";

function tabConfig(tab: ListTab, declaration: ListTabDeclaration): ListTabConfig {
  const found = declaration.tabs.find((candidate) => candidate.id === tab);
  // An id the page never declared cannot be active; the opening tab is the safe reading.
  return found ?? declaration.tabs.find((candidate) => candidate.id === declaration.openingTab)!;
}

/** Reads ?tab= back; anything missing or unknown is the page's opening tab. */
export function parseListTab(raw: string | null, declaration: ListTabDeclaration): ListTab {
  return declaration.tabs.find((tab) => tab.id === raw)?.id ?? declaration.openingTab;
}

export function defaultSortForTab(tab: ListTab, declaration: ListTabDeclaration): EventSort {
  return tabConfig(tab, declaration).startingSort;
}

/**
 * Whether the Status filter is a question on this tab. Where it is not, the page hides the
 * control and drops any status carried into it, so it cannot silently empty the table.
 */
export function tabUsesStatusFilter(tab: ListTab, declaration: ListTabDeclaration): boolean {
  return tabConfig(tab, declaration).offersStatus;
}
