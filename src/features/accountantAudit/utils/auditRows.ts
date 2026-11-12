import type { Enums } from "../../../../database.types";

/**
 * The shapes the Audit tab reads from the local database, and the three pure functions that turn
 * a result row into one of them. docs/specs/accountant-audit-03-tracker-data.md §3.
 */

export type AuditPayment = "paid" | "not_paid" | "none";

export type AuditAddress = {
  street: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostal: string | null;
};

export type AuditTrackerRow = {
  id: string;
  status: Enums<"worktracker_status">;
  date: string | null; // "YYYY-MM-DD"
  bleacherNumber: number | null; // D3: the assigned bleacher
  typeCode: string | null;
  typeName: string | null;
  pickup: AuditAddress | null; // null when the tracker has no pickup address row
  dropoff: AuditAddress | null;
  driveMinutes: number | null;
  distanceMeters: number | null;
  payment: AuditPayment;
};

/** One row of `buildAuditTrackersQuery`, as the local database returns it. */
export type AuditTrackerResultRow = {
  id: string;
  status: string | null;
  date: string | null;
  bleacher_number: number | null;
  type_code: string | null;
  type_name: string | null;
  pickup_id: string | null;
  pickup_street: string | null;
  pickup_city: string | null;
  pickup_state_province: string | null;
  pickup_zip_postal: string | null;
  dropoff_id: string | null;
  dropoff_street: string | null;
  dropoff_city: string | null;
  dropoff_state_province: string | null;
  dropoff_zip_postal: string | null;
  drive_minutes: number | null;
  distance_meters: number | null;
  group_id: string | null;
  /** Local booleans are 0/1; null on a row synced before the column existed. */
  group_is_paid: number | null;
};

/** D2 and R5. */
export function resolvePayment(groupId: string | null, isPaid: number | null): AuditPayment {
  if (groupId === null) return "none";
  return isPaid ? "paid" : "not_paid";
}

/** R4. `total` is undefined while it is loading. */
export function clampPage(page: number, total: number | undefined, pageSize: number): number {
  if (total === undefined) return Math.max(1, page);
  return Math.max(1, Math.min(page, Math.ceil(total / pageSize)));
}

export function toAuditRow(row: AuditTrackerResultRow): AuditTrackerRow {
  return {
    id: row.id,
    status: row.status as Enums<"worktracker_status">,
    date: row.date,
    bleacherNumber: row.bleacher_number,
    typeCode: row.type_code,
    typeName: row.type_name,
    pickup:
      row.pickup_id === null
        ? null
        : {
            street: row.pickup_street,
            city: row.pickup_city,
            stateProvince: row.pickup_state_province,
            zipPostal: row.pickup_zip_postal,
          },
    dropoff:
      row.dropoff_id === null
        ? null
        : {
            street: row.dropoff_street,
            city: row.dropoff_city,
            stateProvince: row.dropoff_state_province,
            zipPostal: row.dropoff_zip_postal,
          },
    driveMinutes: row.drive_minutes,
    distanceMeters: row.distance_meters,
    payment: resolvePayment(row.group_id, row.group_is_paid),
  };
}
