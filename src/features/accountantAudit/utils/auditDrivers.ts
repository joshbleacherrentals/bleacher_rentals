import { STATUSES } from "@/features/manageTeam/constants";
import type { DriverWithUser } from "@/features/workTrackers/hooks/useDrivers.db";

/** One driver in the Audit select. docs/specs/accountant-audit-02-driver-select.md §3 */
export type AuditDriverOption = {
  id: string; // Drivers.id
  driverUuid: string;
  clerkUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  isInactive: boolean; // R3
};

/** R3: inactive when `Drivers.is_active` is false/0/null or the user's status is inactive. Local booleans are 0/1, so test truthiness. */
export function isDriverInactive(d: { is_active: unknown; status_uuid?: string | null }): boolean {
  return !d.is_active || d.status_uuid === STATUSES.inactive;
}

/** D13: alphabetical by first name, then last name; the id breaks ties so the order never flips. */
export function toAuditDriverOptions(drivers: DriverWithUser[]): AuditDriverOption[] {
  return drivers
    .map((d) => ({
      id: d.driver_uuid,
      driverUuid: d.driver_uuid,
      clerkUserId: d.user_id ?? "",
      firstName: d.first_name ?? "",
      lastName: d.last_name ?? "",
      email: d.email ?? "",
      isInactive: isDriverInactive(d),
    }))
    .sort(
      (a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, {
          sensitivity: "base",
        }) || a.id.localeCompare(b.id),
    );
}
