import { collectionsListStateToParams, type CollectionsListState } from "./collectionsListState";

/**
 * The links between the Collections list and the invoice page. The list's state (`csort`, `cdir`,
 * `cnotdue`) travels in the URL both ways, so "Back to tasks" returns to the same order and spec 10
 * can recreate it. docs/specs/accountant-collections-09-design.md §3.
 */

export type InvoiceTab = "info" | "tasks";

/** A stale or missing `tab` opens Information. */
export function parseInvoiceTab(raw: string | null): InvoiceTab {
  return raw === "tasks" ? "tasks" : "info";
}

/** Every parameter the list owns: the ones a state change must clear before it writes its own. */
const LIST_PARAMS = Object.keys(
  collectionsListStateToParams({ sort: "overdue", dir: "desc", showNotDue: true }),
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
