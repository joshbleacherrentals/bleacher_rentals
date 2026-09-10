import type { WebRole } from "@/features/userAccess/logic/determineAccess";

/**
 * Who may record or correct an annual inspection.
 *
 * Kept as a function of roles rather than read off a permissions hook inside
 * the sheet: the roles that may write here are the ones named in the RLS
 * policy on `BleacherAnnualInspections`, and the two lists have to agree.
 * PowerSync drops an RLS refusal silently, so offering a form to someone the
 * database will refuse loses their work without telling them.
 */
const CAN_WRITE: WebRole[] = ["admin", "account_manager", "maintainer"];

export function canRecordInspection(roles: WebRole[]): boolean {
  return roles.some((role) => CAN_WRITE.includes(role));
}
