import { DateTime } from "luxon";
import type { QuotesBookingsFilters } from "../types";

/**
 * The chips above a quotes list table: one per filter that is narrowing
 * the list right now, each removable on its own.
 *
 * Search and Show Deleted count as filters here too — both hide rows, and a
 * forgotten "deleted only" is exactly the kind of thing a chip should surface.
 */

export type ActiveFilterKey =
  | "search"
  | "statuses"
  | "created"
  | "event"
  | "booked"
  | "accountManager"
  | "salesOffice"
  | "goodShuffle"
  | "quickBooks"
  | "showDeleted";

export type ActiveFilter = { key: ActiveFilterKey; label: string };

export type ActiveFilterState = {
  filters: Omit<QuotesBookingsFilters, "isOpen">;
  searchQuery: string;
  showDeleted: boolean;
  /** Whether the page offers the Status filter; where it does not, a status is not a chip. */
  showStatus: boolean;
};

/** Filters store ids; the chips show names. `undefined` while a name has not loaded. */
export type ActiveFilterNames = {
  userName: (id: string) => string | undefined;
  officeName: (id: string) => string | undefined;
};

function formatDay(iso: string): string {
  const date = DateTime.fromISO(iso);
  return date.isValid ? date.toFormat("MMM d, yyyy") : iso;
}

function rangeLabel(from: string | null, to: string | null): string {
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `from ${formatDay(from)}`;
  return `until ${formatDay(to!)}`;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** In the order the Filter Panel lists them, with the search box first. */
export function describeActiveFilters(
  { filters, searchQuery, showDeleted, showStatus }: ActiveFilterState,
  names: ActiveFilterNames,
): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  const add = (key: ActiveFilterKey, label: string) => active.push({ key, label });

  const search = searchQuery.trim();
  if (search) add("search", `Search: “${search}”`);
  if (filters.statuses.length > 0 && showStatus) {
    add("statuses", `Status: ${filters.statuses.map(capitalize).join(", ")}`);
  }
  if (filters.createdFrom || filters.createdTo) {
    add("created", `Created: ${rangeLabel(filters.createdFrom, filters.createdTo)}`);
  }
  if (filters.eventFrom || filters.eventTo) {
    add("event", `Event Start: ${rangeLabel(filters.eventFrom, filters.eventTo)}`);
  }
  if (filters.bookedFrom || filters.bookedTo) {
    add("booked", `Booked: ${rangeLabel(filters.bookedFrom, filters.bookedTo)}`);
  }
  if (filters.accountManagerUserUuid) {
    const name = names.userName(filters.accountManagerUserUuid) ?? "Unknown";
    add("accountManager", `Account Manager: ${name}`);
  }
  if (filters.salesOfficeUuid) {
    add("salesOffice", `Sales Office: ${names.officeName(filters.salesOfficeUuid) ?? "Unknown"}`);
  }
  if (filters.inGoodShuffle !== null)
    add("goodShuffle", `In GoodShuffle: ${yesNo(filters.inGoodShuffle)}`);
  if (filters.inQuickBooks !== null)
    add("quickBooks", `In QuickBooks: ${yesNo(filters.inQuickBooks)}`);
  if (showDeleted) add("showDeleted", "Deleted only");

  return active;
}

/**
 * The Filter Panel state with one chip's filter cleared. Search and Show
 * Deleted live outside the panel, so for those the state comes back unchanged
 * and the page clears them itself.
 */
export function withoutFilter<F extends Omit<QuotesBookingsFilters, "isOpen">>(
  filters: F,
  key: ActiveFilterKey,
): F {
  switch (key) {
    case "statuses":
      return { ...filters, statuses: [] };
    case "created":
      return { ...filters, createdFrom: null, createdTo: null };
    case "event":
      return { ...filters, eventFrom: null, eventTo: null };
    case "booked":
      return { ...filters, bookedFrom: null, bookedTo: null };
    case "accountManager":
      return { ...filters, accountManagerUserUuid: null };
    case "salesOffice":
      return { ...filters, salesOfficeUuid: null };
    case "goodShuffle":
      return { ...filters, inGoodShuffle: null };
    case "quickBooks":
      return { ...filters, inQuickBooks: null };
    case "search":
    case "showDeleted":
      return filters;
  }
}
