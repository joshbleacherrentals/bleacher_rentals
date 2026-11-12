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
 * /accountant: AR Deposits narrows the list to booked events with money due after today (see
 * `accountsReceivable.ts`) and opens on the event closest to today, walking forward from tomorrow.
 * They are booked events by definition, so Status is not offered.
 *
 * The AR tab (money already due, walking back from today) was taken off the page when Collections
 * replaced it. Its logic stays: `accountsReceivable.ts` is what Collections computes Amount Due
 * with, and `useAccountsReceivableData` still works both lists out. To bring the tab back, add
 * `{ id: "ar", startingSort: { key: "start_date", direction: "desc" }, offersStatus: false }`
 * back here and its trigger in app/accountant/page.tsx. A bookmarked `?tab=ar` now opens Collections.
 *
 * Need attention is the third tab: the quotes whose QuickBooks invoice no longer matches the quote,
 * newest event first, whatever their status — so Status is not offered there either.
 * Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §4
 *
 * Collections is the first tab and the one a bare /accountant opens: the open payment-chasing tasks
 * of booked events. It keeps its own order and Show Not Due Yet in the URL (`csort`, `cdir`,
 * `cnotdue`), so the `startingSort` here, which sorts events, is never used.
 * Spec: docs/specs/accountant-collections-07-collections-list.md §3
 *
 * Audit is the last tab: a driver's work trackers with their Paid / Not paid status, read-only. Like
 * Collections it shows none of the receivables chrome and has an order of its own, so the
 * `startingSort` here, which sorts events, is never used.
 * Spec: docs/specs/accountant-audit-01-tab.md §3
 */
export const ACCOUNTANT_TABS: ListTabDeclaration = {
  tabs: [
    { id: "collections", startingSort: DEFAULT_SORT, offersStatus: false },
    {
      id: "ar_deposits",
      startingSort: { key: "start_date", direction: "asc" },
      offersStatus: false,
    },
    {
      id: "need_attention",
      startingSort: { key: "start_date", direction: "desc" },
      offersStatus: false,
    },
    { id: "audit", startingSort: DEFAULT_SORT, offersStatus: false },
  ],
  openingTab: "collections",
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
