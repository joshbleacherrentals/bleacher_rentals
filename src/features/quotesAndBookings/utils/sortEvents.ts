/**
 * Column sorting for the /quotes-bookings list.
 *
 * Like paging, this runs over the in-memory list (PowerSync has it locally).
 * Empty values — an unassigned manager, an unbooked quote — always sink to the
 * bottom whichever way the column is sorted, so flipping direction never buries
 * the real rows under a block of blanks. Ties fall back to newest-created first,
 * which is also the default order when nothing has been clicked.
 */
import type { QuotesBookingsEvent } from "../types";
import { eventSubtotalCents, eventTaxCents } from "./eventAmounts";

export type SortDirection = "asc" | "desc";

export const SORT_KEYS = [
  "event_name",
  "status",
  "account_manager",
  "start_date",
  "booked_at",
  "created_at",
  "subtotal",
  "tax",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export type EventSort = { key: SortKey; direction: SortDirection };

export const DEFAULT_SORT: EventSort = { key: "created_at", direction: "desc" };

type SortValue = string | number | null;

function accountManagerName(e: QuotesBookingsEvent): string | null {
  const name = `${e.account_manager_first_name ?? ""} ${e.account_manager_last_name ?? ""}`.trim();
  return name || null;
}

function timestamp(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const SORT_VALUE: Record<SortKey, (e: QuotesBookingsEvent) => SortValue> = {
  event_name: (e) => e.event_name?.trim() || null,
  status: (e) => e.event_status || null,
  account_manager: accountManagerName,
  start_date: (e) => timestamp(e.event_start),
  booked_at: (e) => timestamp(e.booked_at),
  created_at: (e) => timestamp(e.created_at),
  subtotal: eventSubtotalCents,
  tax: eventTaxCents,
};

/** Text columns read A→Z on the first click; dates and money read newest/biggest first. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  event_name: "asc",
  status: "asc",
  account_manager: "asc",
  start_date: "desc",
  booked_at: "desc",
  created_at: "desc",
  subtotal: "desc",
  tax: "desc",
};

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

export function sortEvents(events: QuotesBookingsEvent[], sort: EventSort): QuotesBookingsEvent[] {
  const valueOf = SORT_VALUE[sort.key];
  const sign = sort.direction === "asc" ? 1 : -1;
  const createdOf = (e: QuotesBookingsEvent) => timestamp(e.created_at);

  return events
    .map((event) => ({ event, value: valueOf(event), created: createdOf(event) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === null && b.value !== null) return 1;
        if (b.value === null && a.value !== null) return -1;
      } else {
        const diff = compareValues(a.value, b.value);
        if (diff !== 0) return sign * diff;
      }
      return (b.created ?? -Infinity) - (a.created ?? -Infinity);
    })
    .map(({ event }) => event);
}

/** The sort a header click leads to: flip the active column, or start a new one. */
export function nextSort(current: EventSort, key: SortKey): EventSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

/** URL form is `key:direction`; the default sort stays out of the URL. */
export function serializeSort(sort: EventSort): string | null {
  if (sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction) return null;
  return `${sort.key}:${sort.direction}`;
}

export function parseSort(raw: string | null): EventSort {
  if (!raw) return DEFAULT_SORT;
  const [key, direction] = raw.split(":");
  const validKey = SORT_KEYS.find((k) => k === key);
  if (!validKey || (direction !== "asc" && direction !== "desc")) return DEFAULT_SORT;
  return { key: validKey, direction };
}
