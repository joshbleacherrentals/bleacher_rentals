import type { CollectionsAmountType, CollectionsListState } from "./collectionsListState";
import type { CollectionsRow } from "./collectionsRows";

/**
 * The filter and the order of the Collections list. Pure: the Collections tab and the invoice
 * page's Previous / Next Task (spec 10) call the same functions, so both see one order.
 * docs/specs/accountant-collections-07-collections-list.md §1 and §3.
 */

/**
 * The list a row belongs to, from its own figures (docs/specs/accountant-collections-23-amount-type-switch.md §1):
 * - `collections`: Amount Due is above 0 and equals what is still to be paid (Remaining). The
 *   calculation caps Amount Due at Remaining, so "equals" and "at least" are the same test.
 * - `deposits`: Amount Due is above 0 and below Remaining.
 * - `null`: Amount Due is 0, an open task that the nightly sync has not closed yet. It is in no
 *   type; only All shows it.
 * The two types never overlap.
 */
export function amountTypeOf(
  row: Pick<CollectionsRow, "amountDueCents" | "remainingCents">,
): Exclude<CollectionsAmountType, "all"> | null {
  if (row.amountDueCents <= 0) return null;
  return row.amountDueCents >= row.remainingCents ? "collections" : "deposits";
}

/**
 * Show Not Due Yet off drops the tasks dated after today (a task due today is always shown); then
 * the amount type keeps the rows of that type, and `all` keeps every row.
 */
export function filterCollectionsRows(
  rows: readonly CollectionsRow[],
  state: CollectionsListState,
  today: string,
): CollectionsRow[] {
  const due = state.showNotDue ? [...rows] : rows.filter((row) => row.dueDate <= today);
  return state.type === "all" ? due : due.filter((row) => amountTypeOf(row) === state.type);
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
