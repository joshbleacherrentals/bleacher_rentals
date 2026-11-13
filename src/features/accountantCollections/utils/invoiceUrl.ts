import {
  collectionsListStateToParams,
  DEFAULT_LIST_STATE,
  type CollectionsListState,
} from "./collectionsListState";

/**
 * The links between the Collections list and the invoice page. The list's state (`csort`, `cdir`,
 * `cnotdue` and `type`) travels in the URL both ways, so "Back to tasks" returns to the same order and spec 10
 * can recreate it. docs/specs/accountant-collections-09-design.md §3.
 */

export type InvoiceTab = "info" | "messages";

/** A stale or missing `tab` opens Information, an old `tab=tasks` link included. */
export function parseInvoiceTab(raw: string | null): InvoiceTab {
  return raw === "messages" ? raw : "info";
}

/** Every parameter the list owns: the ones a state change must clear before it writes its own. */
const LIST_PARAMS = Object.keys(
  collectionsListStateToParams({ sort: "overdue", dir: "desc", showNotDue: true, type: "all" }),
);

export function invoiceHref({
  eventId,
  tab,
  listState,
}: {
  eventId: string;
  tab: InvoiceTab;
  listState: CollectionsListState;
}): string {
  const params = new URLSearchParams({
    id: eventId,
    tab,
    ...collectionsListStateToParams(listState),
  });
  return `/accountant/invoice?${params}`;
}

/**
 * The invoice page of an event on its Information tab, for the Open AR button on the quote card.
 * It carries no list state: the page was not reached from the Collections list.
 */
export function openApHref(eventId: string): string {
  return invoiceHref({ eventId, tab: "info", listState: DEFAULT_LIST_STATE });
}

/**
 * The quote card of an event (`/quotes-bookings/{id}`), for the Open Q/I button. It opens the card
 * as it opens by itself, so no tab is added. docs/specs/accountant-collections-17-open-qi-button.md §3.
 */
export function quoteCardHref(eventId: string): string {
  return `/quotes-bookings/${encodeURIComponent(eventId)}`;
}

export function collectionsHref(listState: CollectionsListState): string {
  const params = new URLSearchParams({
    tab: "collections",
    ...collectionsListStateToParams(listState),
  });
  return `/accountant?${params}`;
}

/** The query string with the list's parameters replaced by `state`'s; every other one is kept. */
export function withCollectionsListState(
  current: URLSearchParams,
  state: CollectionsListState,
): string {
  const params = new URLSearchParams(current.toString());
  for (const key of LIST_PARAMS) params.delete(key);
  for (const [key, value] of Object.entries(collectionsListStateToParams(state))) {
    params.set(key, value);
  }
  return params.toString();
}
