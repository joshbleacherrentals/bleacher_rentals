import type {
  RawBleacherOption,
  RawCategoryOption,
  RawVendorOption,
  RawZoneOption,
} from "../db/repairFilterQueries";
import type { RepairListRow } from "./repairRows";

/**
 * Narrowing the Repairs list: the search text, the four filters (Bleacher, Zone, Vendor, Category)
 * and the lists of values the filters offer. Pure, so it is tested without React.
 * docs/specs/repairs-05-toolbar.md §2.2 to §2.4 and §3 (D57, D58, D61, D68, D77; the signatures
 * here are locked by that spec).
 */

/** The search box waits this long after the last letter before the list and the address change. */
export const SEARCH_PAUSE_MS = 300;

/** The hint in the search box; it names the five things the search reads (D57). */
export const SEARCH_HINT = "Search invoice #, vendor, notes, bleacher #, category";

/** The label of a ticked value that the list of its filter does not have (D68). */
export const UNKNOWN_LABEL = "Unknown";

/**
 * Whether the repair holds the text. The text is trimmed and compared without difference of case,
 * as one piece, against one field at a time: the invoice number, the vendor's name, the notes, each
 * bleacher written `#N` and each category name (D57, D58). An empty text matches every repair.
 */
export function repairMatchesSearch(row: RepairListRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const fields: (string | null)[] = [
    row.invoiceNumber,
    row.vendorName,
    row.notes,
    ...row.bleachers.map((b) => (b.number === null ? null : `#${b.number}`)),
    ...row.categories.map((c) => c.name),
  ];
  return fields.some((field) => field !== null && field.toLowerCase().includes(needle));
}

export type RepairFilterCriteria = {
  search: string;
  bleacherUuids: readonly string[];
  zoneUuids: readonly string[];
  vendorUuids: readonly string[];
  categoryUuids: readonly string[];
};

/**
 * The repairs that pass the search and all four filters, in the order they came in. Inside one
 * filter a repair passes on any ticked value; an empty filter passes everything (D14, D62).
 * Bleacher uses the bleachers of the junction (D29), Zone the zones of the row (D33).
 */
export function filterRepairs(
  rows: readonly RepairListRow[],
  criteria: RepairFilterCriteria,
): RepairListRow[] {
  const bleachers = new Set(criteria.bleacherUuids);
  const zones = new Set(criteria.zoneUuids);
  const vendors = new Set(criteria.vendorUuids);
  const categories = new Set(criteria.categoryUuids);
  return rows.filter(
    (row) =>
      repairMatchesSearch(row, criteria.search) &&
      (bleachers.size === 0 || row.bleachers.some((b) => bleachers.has(b.uuid))) &&
      (zones.size === 0 || row.zones.some((z) => zones.has(z.uuid))) &&
      (vendors.size === 0 || (row.vendorUuid !== null && vendors.has(row.vendorUuid))) &&
      (categories.size === 0 || row.categories.some((c) => categories.has(c.uuid))),
  );
}

export type FilterKey = "bleacher" | "zone" | "vendor" | "category";
export type FilterOption = { value: string; label: string; inactive: boolean };
export type RepairFilterOptions = Record<FilterKey, FilterOption[]>;

// No difference of case, numbers inside a name read as numbers: Zone 2 before Zone 10 (D77).
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function byLabel(a: FilterOption, b: FilterOption): number {
  return collator.compare(a.label, b.label) || compareText(a.value, b.value);
}

/**
 * What each filter lists (D61, D77): the bleachers that are not deleted, by number, smallest first
 * (`#?` for one with no number, last); every zone, vendor and category by name, A to Z. A vendor or
 * a category with `is_active` false stays in its list, marked inactive; an empty flag is active.
 */
export function buildRepairFilterOptions(raw: {
  bleachers: readonly RawBleacherOption[];
  zones: readonly RawZoneOption[];
  vendors: readonly RawVendorOption[];
  categories: readonly RawCategoryOption[];
}): RepairFilterOptions {
  const bleacher = raw.bleachers
    .filter((b) => !b.deleted)
    .sort(
      (a, b) =>
        (a.bleacherNumber ?? Number.POSITIVE_INFINITY) -
          (b.bleacherNumber ?? Number.POSITIVE_INFINITY) || compareText(a.id, b.id),
    )
    .map((b) => ({
      value: b.id,
      label: b.bleacherNumber === null ? "#?" : `#${b.bleacherNumber}`,
      inactive: false,
    }));

  const zone = raw.zones
    .map((z) => ({ value: z.id, label: z.name ?? "Unnamed zone", inactive: false }))
    .sort(byLabel);

  const vendor = raw.vendors
    .map((v) => ({ value: v.id, label: v.name ?? "Unnamed vendor", inactive: v.isActive === 0 }))
    .sort(byLabel);

  const category = raw.categories
    .map((c) => ({ value: c.id, label: c.name ?? "Unnamed category", inactive: c.isActive === 0 }))
    .sort(byLabel);

  return { bleacher, zone, vendor, category };
}

/**
 * The list with every ticked value it lacks added at the top, ticked by the caller and named
 * Unknown (D68): an address can name a deleted bleacher or a vendor that is gone.
 */
export function withUnknownSelected(
  options: readonly FilterOption[],
  selected: readonly string[],
): FilterOption[] {
  const known = new Set(options.map((o) => o.value));
  const missing: FilterOption[] = [];
  for (const value of selected) {
    if (known.has(value)) continue;
    known.add(value);
    missing.push({ value, label: UNKNOWN_LABEL, inactive: false });
  }
  return [...missing, ...options];
}

/** The options whose label holds the text, without difference of case; an empty text keeps all. */
export function searchOptions(options: readonly FilterOption[], text: string): FilterOption[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [...options];
  return options.filter((o) => o.label.toLowerCase().includes(needle));
}
