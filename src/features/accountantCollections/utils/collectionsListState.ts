/**
 * The state of the Collections list and its round trip through the URL, so that the invoice page
 * can recreate the order (docs/specs/accountant-collections-10-prev-next.md).
 * docs/specs/accountant-collections-07-collections-list.md §3.
 *
 * `useListPageState` owns `tab`, `sort`, `page`, `pageSize`, `q`, `showDeleted` and the filters, and
 * keeps every parameter it does not know. The list therefore has names of its own: `csort`, `cdir`
 * and `cnotdue`. The amount type (the Collections / Deposits / All switch, spec 23) is `type`, which
 * `useListPageState` does not own either.
 */

export type CollectionsSortKey = "followUp" | "overdue" | "amount";

/** The three lists of the switch: Collections and Deposits never overlap; All is every row. */
export type CollectionsAmountType = "collections" | "deposits" | "all";

/** In click order: a click goes to the next one, and from the last back to the first. */
export const AMOUNT_TYPES: readonly CollectionsAmountType[] = ["collections", "deposits", "all"];

export type CollectionsListState = {
  sort: CollectionsSortKey;
  dir: "asc" | "desc";
  showNotDue: boolean;
  type: CollectionsAmountType;
};

export const DEFAULT_LIST_STATE: CollectionsListState = {
  sort: "followUp",
  dir: "asc",
  showNotDue: false,
  type: "collections",
};

const PARAM = { sort: "csort", dir: "cdir", showNotDue: "cnotdue", type: "type" } as const;

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

  // An exact lower-case match: `Deposits` or `bogus` reads as the default, Collections.
  const typeParam = searchParams.get(PARAM.type);
  const type = AMOUNT_TYPES.find((candidate) => candidate === typeParam) ?? DEFAULT_LIST_STATE.type;

  return {
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : DEFAULT_LIST_STATE.dir,
    showNotDue: searchParams.get(PARAM.showNotDue) === "1",
    type,
  };
}

/** The parameters that differ from the default: the default state is an empty object. */
export function collectionsListStateToParams(state: CollectionsListState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.sort !== DEFAULT_LIST_STATE.sort) params[PARAM.sort] = SORT_TO_PARAM[state.sort];
  if (state.dir !== DEFAULT_LIST_STATE.dir) params[PARAM.dir] = state.dir;
  if (state.showNotDue) params[PARAM.showNotDue] = "1";
  if (state.type !== DEFAULT_LIST_STATE.type) params[PARAM.type] = state.type;
  return params;
}

/** A click on the switch: Collections, Deposits, All, and Collections again. */
export function nextAmountType(type: CollectionsAmountType): CollectionsAmountType {
  return AMOUNT_TYPES[(AMOUNT_TYPES.indexOf(type) + 1) % AMOUNT_TYPES.length];
}

/** A click on a column header: the same column flips the direction, another one sorts descending. */
export function nextSortState(
  state: CollectionsListState,
  key: CollectionsSortKey,
): CollectionsListState {
  if (state.sort === key) return { ...state, dir: state.dir === "asc" ? "desc" : "asc" };
  return { ...state, sort: key, dir: "desc" };
}
