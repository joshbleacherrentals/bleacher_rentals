/**
 * The list behind EntitySearchSelect's dropdown.
 *
 * With a thousand companies or venues on file, rendering every row makes the panel useless: the
 * "+ Create New ..." row is unreachable and nobody scrolls that far anyway. So the panel shows a
 * page of matches, says how many more there are, and asks the user to keep typing.
 */
export const ENTITY_SEARCH_LIMIT = 50;

export type EntitySearchResult<T> = {
  /** The rows to render — at most `limit` of them. */
  shown: T[];
  /** How many items match the query in total. */
  matched: number;
  /** Matches left out of `shown`. */
  hidden: number;
};

export function searchEntities<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
  limit: number = ENTITY_SEARCH_LIMIT,
): EntitySearchResult<T> {
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((item) => getSearchText(item).toLowerCase().includes(q)) : items;

  return {
    shown: matches.slice(0, limit),
    matched: matches.length,
    hidden: Math.max(matches.length - limit, 0),
  };
}
