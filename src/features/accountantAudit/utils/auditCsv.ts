import { buildCsv, csvTextField, escapeCsvField } from "@/lib/csv";
import { formatDriveTime, formatMileage } from "@/features/workTrackers/util";
import type { AuditDriverRow } from "./auditDriverRows";
import {
  auditStatusLabel,
  formatAddressLines,
  formatDriverDistance,
  formatDriverDriveTime,
  formatPayAmount,
} from "./auditFormat";
import type { AuditRange } from "./auditRange";
import type { AuditAddress, AuditTrackerRow } from "./auditRows";

/**
 * The Audit tab as CSV files: the drivers table, and one driver's work trackers. The same columns
 * the tables show, in the order they are in, each cell the text the table prints. A dash on the
 * screen is an empty cell in the file.
 */

export const AUDIT_DRIVERS_CSV_HEADERS = [
  "Driver",
  "Distance",
  "Drive Time",
  "Trips",
  "Pay",
] as const;

export const AUDIT_TRACKERS_CSV_HEADERS = [
  "Status",
  "Date",
  "Bleacher",
  "Type",
  "Pickup location",
  "Dropoff location",
  "Drive time",
  "Distance",
  "Payment status",
] as const;

export function buildAuditDriversCsv(rows: readonly AuditDriverRow[]): string {
  return buildCsv(
    AUDIT_DRIVERS_CSV_HEADERS,
    rows.map((row) => [
      csvTextField([row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown Driver"),
      escapeCsvField(formatDriverDistance(row.distanceMeters)),
      escapeCsvField(row.driveMinutes > 0 ? formatDriverDriveTime(row.driveMinutes) : ""),
      String(row.tripCount),
      escapeCsvField(formatPayAmount(row.payCents, row.payCurrency)),
    ]),
  );
}

/** The street and, after it, `city, state zip` — on one line, where the table has two. */
function locationField(address: AuditAddress | null): string {
  const lines = formatAddressLines(address);
  return csvTextField([lines?.street, lines?.place].filter(Boolean).join(", "));
}

const PAYMENT_TEXT = { paid: "Paid", not_paid: "Not paid", none: "" } as const;

export function buildAuditTrackersCsv(rows: readonly AuditTrackerRow[]): string {
  return buildCsv(
    AUDIT_TRACKERS_CSV_HEADERS,
    rows.map((row) => [
      escapeCsvField(auditStatusLabel(row.status)),
      escapeCsvField(row.date ?? ""),
      row.bleacherNumber !== null ? String(row.bleacherNumber) : "",
      csvTextField(row.typeName ?? ""),
      locationField(row.pickup),
      locationField(row.dropoff),
      escapeCsvField(formatDriveTime(row.driveMinutes)),
      escapeCsvField(formatMileage(row.distanceMeters)),
      PAYMENT_TEXT[row.payment],
    ]),
  );
}

/** The range in a file name, since the file itself does not say what dates it covers. */
function rangeLabel({ from, to }: AuditRange): string {
  if (from && to) return `${from}-to-${to}`;
  if (from) return `from-${from}`;
  if (to) return `until-${to}`;
  return "all-time";
}

/** A driver's name as part of a file name: lower case, no accents, dashes between the words. */
function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "driver"
  );
}

export function auditDriversCsvPrefix(range: AuditRange): string {
  return `accountant-audit-drivers-${rangeLabel(range)}`;
}

export function auditTrackersCsvPrefix(driverName: string, range: AuditRange): string {
  return `accountant-audit-${slug(driverName)}-${rangeLabel(range)}`;
}
