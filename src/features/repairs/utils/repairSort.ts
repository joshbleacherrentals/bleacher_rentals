import type { RepairListRow } from "./repairRows";

/**
 * Sorting the Repairs table from its column headers: which columns sort, what each one reads, the
 * first direction of a click, and the `key:direction` form in the address.
 * docs/specs/repairs-05-toolbar.md §2.5 and §3 (D72 to D75; the signatures here are locked by it).
 */

export const REPAIR_SORT_KEYS = [
  "reported",
  "from",
  "to",
  "zone",
  "notes",
  "status",
  "vendor",
  "invoice",
  "labor",
  "parts",
  "tax",
  "freight",
  "total",
  "completed",
] as const;

export type RepairSortKey = (typeof REPAIR_SORT_KEYS)[number];
export type RepairSort = { key: RepairSortKey; direction: "asc" | "desc" };

type Direction = RepairSort["direction"];

/** The course of a repair (D74); a status the code does not know comes after Completed. */
const STATUS_COURSE: readonly string[] = [
  "inbound",
  "triaged",
  "waiting_repair",
  "in_repair",
  "confirm_repair",
  "completed",
];

/** `YYYY-MM-DD` days order correctly as plain text; texts use the collator; amounts are numbers. */
type Kind = "day" | "text" | "number";
type Value = string | number | null;

type Column = {
  kind: Kind;
  /** The direction of the first click on this column (D72). */
  first: Direction;
  value: (row: RepairListRow) => Value;
};

/** Empty is a null or a blank text. */
function filled(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

const COLUMNS: Record<RepairSortKey, Column> = {
  // The first report of a row is the one its cell shows: the earliest (D75).
  reported: { kind: "day", first: "desc", value: (r) => filled(r.reported[0]?.day) },
  from: { kind: "day", first: "desc", value: (r) => filled(r.eventStart) },
  to: { kind: "day", first: "desc", value: (r) => filled(r.eventEnd) },
  completed: { kind: "day", first: "desc", value: (r) => filled(r.completedOn) },
  // The zones of a row are ordered by name, so the first one is the top line of the cell (D75).
  zone: { kind: "text", first: "asc", value: (r) => filled(r.zones[0]?.name) },
  notes: { kind: "text", first: "asc", value: (r) => filled(r.notes) },
  vendor: { kind: "text", first: "asc", value: (r) => filled(r.vendorName) },
  invoice: { kind: "text", first: "asc", value: (r) => filled(r.invoiceNumber) },
  status: {
    kind: "number",
    first: "asc",
    value: (r) => {
      const place = STATUS_COURSE.indexOf(r.status);
      return place === -1 ? STATUS_COURSE.length : place;
    },
  },
  labor: { kind: "number", first: "desc", value: (r) => r.laborCents },
  parts: { kind: "number", first: "desc", value: (r) => r.partsCents },
  tax: { kind: "number", first: "desc", value: (r) => r.taxCents },
  freight: { kind: "number", first: "desc", value: (r) => r.freightCents },
  total: { kind: "number", first: "desc", value: (r) => r.totalCents },
};

// No difference of case, and numbers inside a text read as numbers: JJ-5 before JJ-12 (D72).
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Ascending order; an empty value is smaller than any other (D73). */
function compare(kind: Kind, a: Value, b: Value): number {
  if (a === null || b === null) {
    if (a === null && b === null) return 0;
    return a === null ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  if (kind === "text") return collator.compare(x, y);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * The rows in the order of the sort. Rows that compare equal keep the order they came in (the
 * starting order, D36). `null` returns the same order. The input is not changed.
 */
export function sortRepairs(
  rows: readonly RepairListRow[],
  sort: RepairSort | null,
): RepairListRow[] {
  if (!sort) return [...rows];
  const { kind, value } = COLUMNS[sort.key];
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      const diff = compare(kind, a.value, b.value);
      return diff !== 0 ? sign * diff : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * What a click on a header leads to (D72): the same column flips its direction; another column (or
 * no sort) starts with that column's first direction. There is no third click.
 */
export function nextRepairSort(current: RepairSort | null, key: RepairSortKey): RepairSort {
  if (current && current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: COLUMNS[key].first };
}

/** The address form, `total:desc`; no sort is not written. */
export function serializeRepairSort(sort: RepairSort | null): string | null {
  return sort ? `${sort.key}:${sort.direction}` : null;
}

/** Reads `key:direction` back; anything else is no sort. */
export function parseRepairSort(raw: string | null): RepairSort | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const [key, direction] = parts;
  const validKey = REPAIR_SORT_KEYS.find((k) => k === key);
  if (!validKey || (direction !== "asc" && direction !== "desc")) return null;
  return { key: validKey, direction };
}
