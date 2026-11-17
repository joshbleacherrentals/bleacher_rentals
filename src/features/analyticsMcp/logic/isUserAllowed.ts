import { STATUSES } from "@/features/manageTeam/constants";
import type { AccessDecision } from "../types";

/**
 * docs/specs/analytics-mcp.md §1 D2. Anyone with a Users row that is not deactivated: invited,
 * active, or with no status. The role (admin, account manager, driver, ...) does not matter. This is
 * the only place that rule lives.
 */
export function isUserAllowed(
  user: { id: string; status_uuid: string | null } | null,
): AccessDecision {
  if (!user) return { allowed: false, reason: "no-account" };
  if (user.status_uuid === STATUSES.inactive) {
    return { allowed: false, reason: "account-deactivated" };
  }
  return { allowed: true, userId: user.id };
}
