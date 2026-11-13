import {
  normalizePayCurrency,
  type PayCurrency,
} from "@/features/workTrackers/util/payCurrencyFilter";

/**
 * One row of the drivers table of the Audit tab, and what turns the query result into rows.
 * docs/specs/accountant-audit-05-drivers-table.md §2.1 (D1, D2, D17, R6, R23, R24).
 */

/** What the totals query returns for one driver. */
export type AuditDriverTotalsResultRow = {
  driver_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  pay_currency: string | null;
  distance_meters: number | null;
  drive_minutes: number | null;
  pay_cents: number | null;
  trip_count: number;
};

export type AuditDriverRow = {
  driverUuid: string;
  firstName: string | null;
  lastName: string | null;
  distanceMeters: number;
  driveMinutes: number;
  payCents: number;
  /** The driver's own currency (R24); an empty one counts as USD, as on /work-trackers. */
  payCurrency: PayCurrency;
  tripCount: number;
};

/**
 * Drops a row with no driver, turns null sums into 0 and normalises the currency. The rows come
 * back in the order of the query: sorting is a separate step (R23).
 */
export function toAuditDriverRows(rows: AuditDriverTotalsResultRow[]): AuditDriverRow[] {
  return rows
    .filter(
      (r): r is AuditDriverTotalsResultRow & { driver_uuid: string } => r.driver_uuid !== null,
    )
    .map((r) => ({
      driverUuid: r.driver_uuid,
      firstName: r.first_name,
      lastName: r.last_name,
      distanceMeters: r.distance_meters ?? 0,
      driveMinutes: r.drive_minutes ?? 0,
      payCents: r.pay_cents ?? 0,
      payCurrency: normalizePayCurrency(r.pay_currency),
      tripCount: r.trip_count,
    }));
}

/** R6: a case-insensitive "contains" on "first last", on the trimmed text; empty text keeps all. */
export function filterAuditDriverRows(rows: AuditDriverRow[], search: string): AuditDriverRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    [r.firstName, r.lastName].filter(Boolean).join(" ").toLowerCase().includes(needle),
  );
}
