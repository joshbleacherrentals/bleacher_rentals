import { METERS_PER_MILE } from "@/features/workTrackers/util";
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

/**
 * Drive Time of a driver's total, in the scorecard's format: `45m`, `2h`, `2h 5m`; a dash when
 * there is none. docs/specs/accountant-audit-05-drivers-table.md R25.
 */
export function formatDriverDriveTime(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Pay with its currency: `$1,234.00 USD`, `$567.00 CAD`. The scorecard's format (`$`, two decimals,
 * thousands separators) followed by the code (D17, R24). en-US so the digits do not depend on the
 * browser's locale beside a `$` and a code.
 */
export function formatPayAmount(cents: number, currency: "USD" | "CAD"): string {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${amount} ${currency}`;
}

/**
 * A driver's total distance, kilometres first and then miles: `27726.0 km/17228.2 mi` (D16, R25).
 * The miles use the conversion /work-trackers already uses. The tracker rows of the driver page
 * keep their own `21.4 mi (34.4 km)` (spec 04).
 */
export function formatDriverDistance(distanceMeters: number): string {
  const km = distanceMeters / 1000;
  const miles = distanceMeters / METERS_PER_MILE;
  return `${km.toFixed(1)} km/${miles.toFixed(1)} mi`;
}

/**
 * The letters in a driver's avatar: the first letter of the first and of the last word of the name,
 * in capitals (`Matt Pilcher` is `MP`); one letter for a one-word name; `?` when there is no name.
 * `Array.from` keeps a letter outside the basic plane in one piece.
 */
export function driverInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

/**
 * `21.4 mi (34.4 km)` (what `formatMileage` prints) as `{ miles: "21.4 mi", km: "(34.4 km)" }`, so a
 * cell can put the two on their own lines and never break inside the brackets. Null when the text
 * has another shape; the caller then prints it whole.
 */
export function splitMileage(text: string): { miles: string; km: string } | null {
  const match = /^(.+?) (\(.+\))$/.exec(text);
  return match ? { miles: match[1], km: match[2] } : null;
}
