import type { AuditAddress } from "./auditRows";

/**
 * Text for the cells of the Audit table. docs/specs/accountant-audit-04-table.md §3 (R3, R5, R11).
 */

const clean = (part: string | null | undefined) => part?.trim() ?? "";

/**
 * A location as two lines: the street, and `city, state zip` with the empty parts left out
 * (same parts as `formatAddressForCopy`). Null when there is nothing to show (R5).
 */
export function formatAddressLines(
  a: AuditAddress | null,
): { street: string; place: string } | null {
  if (!a) return null;
  const street = clean(a.street);
  const stateAndZip = [clean(a.stateProvince), clean(a.zipPostal)].filter(Boolean).join(" ");
  const place = [clean(a.city), stateAndZip].filter(Boolean).join(", ");
  if (!street && !place) return null;
  return { street, place };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  released: "Released",
  accepted: "Accepted",
  dest_pickup: "In Progress",
  pickup_inspection: "In Progress",
  dest_dropoff: "In Progress",
  dropoff_inspection: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  abandoned: "Abandoned",
};

/** The words `WorkTrackerStatusBadge` prints for a status; an unknown value stays as it is (R11). */
export function auditStatusLabel(status: string): string {
  return Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : status;
}
