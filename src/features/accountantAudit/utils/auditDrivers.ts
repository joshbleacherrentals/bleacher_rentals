import { STATUSES } from "@/features/manageTeam/constants";

/**
 * R3 of docs/specs/accountant-audit-02-driver-select.md, kept by R15 of
 * accountant-audit-05-drivers-table.md: the heading of the driver page marks a deactivated driver.
 * Inactive when `Drivers.is_active` is false/0/null or the user's status is inactive. Local
 * booleans are 0/1, so test truthiness.
 */
export function isDriverInactive(d: { is_active: unknown; status_uuid?: string | null }): boolean {
  return !d.is_active || d.status_uuid === STATUSES.inactive;
}
