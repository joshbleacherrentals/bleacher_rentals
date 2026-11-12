import type { AuditDriverRow } from "./auditDriverRows";

/**
 * Sorting of the drivers table of the Audit tab.
 * docs/specs/accountant-audit-05-drivers-table.md §2.1 (D19, D20, D22, R4, R22, R23).
 */
export const AUDIT_SORT_KEYS = ["driver", "distance", "time", "trips", "pay"] as const;
export type AuditSortKey = (typeof AUDIT_SORT_KEYS)[number];
export type AuditSortDirection = "asc" | "desc";
export type AuditSort = { key: AuditSortKey; direction: AuditSortDirection };

/** D19: the table opens on Pay, largest first. */
export const DEFAULT_AUDIT_SORT: AuditSort = { key: "pay", direction: "desc" };

/** D20: Driver reads A to Z on the first click, the four number columns largest first. */
export const FIRST_DIRECTION: Record<AuditSortKey, AuditSortDirection> = {
  driver: "asc",
  distance: "desc",
  time: "desc",
  trips: "desc",
  pay: "desc",
};

/** R22: a click on the sorted column flips it; a click on another column selects it. */
export function nextAuditSort(current: AuditSort, clicked: AuditSortKey): AuditSort {
  if (current.key === clicked) {
    return { key: clicked, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: clicked, direction: FIRST_DIRECTION[clicked] };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** First name, then last name, ignoring case (R4). */
const byName = (a: AuditDriverRow, b: AuditDriverRow) =>
  collator.compare(a.firstName ?? "", b.firstName ?? "") ||
  collator.compare(a.lastName ?? "", b.lastName ?? "");

const byId = (a: AuditDriverRow, b: AuditDriverRow) =>
  a.driverUuid < b.driverUuid ? -1 : a.driverUuid > b.driverUuid ? 1 : 0;

const NUMBER_OF: Record<Exclude<AuditSortKey, "driver">, (r: AuditDriverRow) => number> = {
  distance: (r) => r.distanceMeters,
  time: (r) => r.driveMinutes,
  trips: (r) => r.tripCount,
  // D22: the plain cents, whatever the currency; nothing is converted.
  pay: (r) => r.payCents,
};

/**
 * R4, R23: a new array, sorted by the key in the direction. Equal rows go by first name, last
 * name, then driver id, always from A to Z whatever the direction, so two equal rows never swap
 * places between renders.
 */
export function sortAuditDriverRows(rows: AuditDriverRow[], sort: AuditSort): AuditDriverRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary =
      sort.key === "driver" ? byName(a, b) : NUMBER_OF[sort.key](a) - NUMBER_OF[sort.key](b);
    return sign * primary || byName(a, b) || byId(a, b);
  });
}
