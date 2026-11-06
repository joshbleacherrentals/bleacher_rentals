import type { CollectionsListState } from "./collectionsListState";
import type { CollectionsRow } from "./collectionsRows";

/**
 * The filter and the order of the Collections list. Pure: the Collections tab and the invoice
 * page's Previous / Next Task (spec 10) call the same functions, so both see one order.
 * docs/specs/accountant-collections-07-collections-list.md §1 and §3.
 */

/** Show Not Due Yet off drops the tasks dated after today; a task due today is always shown. */
export function filterCollectionsRows(
  rows: readonly CollectionsRow[],
  state: CollectionsListState,
  today: string,
): CollectionsRow[] {
  return state.showNotDue ? [...rows] : rows.filter((row) => row.dueDate <= today);
}

type Compare = (a: CollectionsRow, b: CollectionsRow) => number;

const cmp = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0);

// The secondary keys never change direction, whatever the chosen column does:
// the largest amount, the most days and the oldest task come first.
const followUpOldest: Compare = (a, b) => cmp(a.dueDate, b.dueDate);
const amountLargest: Compare = (a, b) => cmp(b.amountDueCents, a.amountDueCents);
const daysMost: Compare = (a, b) => cmp(b.daysOverdue ?? 0, a.daysOverdue ?? 0);
const eventId: Compare = (a, b) => cmp(a.eventId, b.eventId);

/** The chain after the chosen column (spec 07 §1); the event id makes the order total. */
const TIE_CHAIN: Record<CollectionsListState["sort"], Compare[]> = {
  followUp: [amountLargest, daysMost, eventId],
  amount: [daysMost, followUpOldest, eventId],
  overdue: [amountLargest, followUpOldest, eventId],
};

const PRIMARY: Record<CollectionsListState["sort"], Compare> = {
  followUp: followUpOldest,
  amount: (a, b) => cmp(a.amountDueCents, b.amountDueCents),
  overdue: (a, b) => cmp(a.daysOverdue ?? 0, b.daysOverdue ?? 0),
};

export function sortCollectionsRows(
  rows: readonly CollectionsRow[],
  state: CollectionsListState,
): CollectionsRow[] {
  const primary = PRIMARY[state.sort];
  const sign = state.dir === "asc" ? 1 : -1;
  const chain = TIE_CHAIN[state.sort];

  return [...rows].sort((a, b) => {
    const first = primary(a, b) * sign;
    if (first !== 0) return first;
    for (const compare of chain) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}
