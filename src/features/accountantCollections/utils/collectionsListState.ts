/**
 * The state of the Collections list and its round trip through the URL, so that the invoice page
 * can recreate the order (docs/specs/accountant-collections-10-prev-next.md).
 * docs/specs/accountant-collections-07-collections-list.md §3.
 *
 * `useListPageState` owns `tab`, `sort`, `page`, `pageSize`, `q`, `showDeleted` and the filters, and
 * keeps every parameter it does not know. The list therefore has names of its own: `csort`, `cdir`
 * and `cnotdue`.
 */

export type CollectionsSortKey = "followUp" | "overdue" | "amount";

export type CollectionsListState = {
  sort: CollectionsSortKey;
  dir: "asc" | "desc";
  showNotDue: boolean;
};

export const DEFAULT_LIST_STATE: CollectionsListState = {
  sort: "followUp",
  dir: "asc",
  showNotDue: false,
};

const PARAM = { sort: "csort", dir: "cdir", showNotDue: "cnotdue" } as const;

const SORT_TO_PARAM: Record<CollectionsSortKey, string> = {
  followUp: "follow",
  overdue: "overdue",
  amount: "amount",
};

/** Reads the list state back; a missing or unknown value is that field's default. */
export function parseCollectionsListState(searchParams: {
  get(key: string): string | null;
}): CollectionsListState {
  const sortParam = searchParams.get(PARAM.sort);
  const dirParam = searchParams.get(PARAM.dir);
  const sort =
    (Object.keys(SORT_TO_PARAM) as CollectionsSortKey[]).find(
      (key) => SORT_TO_PARAM[key] === sortParam,
    ) ?? DEFAULT_LIST_STATE.sort;

  return {
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : DEFAULT_LIST_STATE.dir,
    showNotDue: searchParams.get(PARAM.showNotDue) === "1",
  };
}

/** The parameters that differ from the default: the default state is an empty object. */
export function collectionsListStateToParams(state: CollectionsListState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.sort !== DEFAULT_LIST_STATE.sort) params[PARAM.sort] = SORT_TO_PARAM[state.sort];
  if (state.dir !== DEFAULT_LIST_STATE.dir) params[PARAM.dir] = state.dir;
  if (state.showNotDue) params[PARAM.showNotDue] = "1";
  return params;
}

/** A click on a column header: the same column flips the direction, another one sorts descending. */
export function nextSortState(
  state: CollectionsListState,
  key: CollectionsSortKey,
): CollectionsListState {
  if (state.sort === key) return { ...state, dir: state.dir === "asc" ? "desc" : "asc" };
  return { ...state, sort: key, dir: "desc" };
}
