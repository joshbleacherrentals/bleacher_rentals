import type {
  VendorRecord,
  VendorStatus,
  VendorType,
} from "@/features/manageTeam/utils/vendorForm";
import { VENDOR_TYPE_LABELS } from "./vendorLabels";

/**
 * What the Vendors page does with the vendors it has: the view (active or deleted), the search by
 * words, the Type and Status filters and the sorting, as pure functions of a list and a state
 * (docs/specs/vendors-page.md §4.6, D19 to D22, D24). No React.
 */

export type VendorSortKey = "vendor" | "type";
export type VendorSort = { key: VendorSortKey; direction: "asc" | "desc" };

/** A value of the Status filter: one of the five statuses, or "none" for a vendor with no status. */
export type StatusFilterValue = VendorStatus | "none";

/** Everything the toolbar and the headers hold. It lives in memory only (D22). */
export type VendorListState = {
  search: string;
  type: VendorType | "all";
  /** Several at once; empty means no Status filter. */
  statuses: readonly StatusFilterValue[];
  showDeleted: boolean;
  sort: VendorSort;
};

/** D19: the list starts as the active vendors, Vendor A to Z. */
export const INITIAL_VENDOR_LIST_STATE: VendorListState = {
  search: "",
  type: "all",
  statuses: [],
  showDeleted: false,
  sort: { key: "vendor", direction: "asc" },
};

const collator = new Intl.Collator("en", { sensitivity: "base" });

/** The texts the search looks in (D20). The street and the postal code are not among them. */
function searchableTexts(v: VendorRecord): string[] {
  return [
    v.displayName,
    v.contactName,
    v.contactEmail,
    v.phone,
    v.address?.city,
    v.address?.stateProvince,
    v.address?.country,
    v.notes,
  ]
    .filter((t): t is string => !!t)
    .map((t) => t.toLowerCase());
}

/**
 * D20: the text is cut into words; every word must appear (a part of a word counts, not
 * case-sensitive) in at least one of the texts, in any order. An empty text matches everything.
 */
export function matchesSearch(vendor: VendorRecord, text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const texts = searchableTexts(vendor);
  return words.every((word) => texts.some((t) => t.includes(word)));
}

/** D21: the Type filter and the Status filter; a row must pass both. */
export function matchesFilters(
  vendor: VendorRecord,
  filters: { type: VendorType | "all"; statuses: readonly StatusFilterValue[] },
): boolean {
  if (filters.type !== "all" && vendor.type !== filters.type) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(vendor.status ?? "none")) {
    return false;
  }
  return true;
}

const byName = (a: VendorRecord, b: VendorRecord) => collator.compare(a.displayName, b.displayName);

/** D19: by Vendor or by Type, in the given direction; a tie always goes by name A to Z. */
export function sortVendors(vendors: readonly VendorRecord[], sort: VendorSort): VendorRecord[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...vendors].sort((a, b) => {
    if (sort.key === "type") {
      const diff = collator.compare(VENDOR_TYPE_LABELS[a.type], VENDOR_TYPE_LABELS[b.type]);
      if (diff !== 0) return sign * diff;
      return byName(a, b);
    }
    const diff = byName(a, b);
    return diff !== 0 ? sign * diff : a.id.localeCompare(b.id);
  });
}

/** D19: a click on the column that is sorted flips the direction; on the other one it sorts it up. */
export function nextSort(current: VendorSort, key: VendorSortKey): VendorSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

/**
 * The rows the table shows: the view first (active vendors, or only the deleted ones with Show
 * Deleted), then the search and the filters (all must match, in both views), then the sort.
 */
export function buildVendorRows(
  vendors: readonly VendorRecord[],
  state: VendorListState,
): VendorRecord[] {
  const shown = vendors.filter(
    (v) =>
      (state.showDeleted ? !v.isActive : v.isActive) &&
      matchesSearch(v, state.search) &&
      matchesFilters(v, state),
  );
  return sortVendors(shown, state.sort);
}
