import { STATUSES } from "@/features/manageTeam/constants";
import type { UserAccessData } from "../types";

export type WebRole =
  | "admin"
  | "account_manager"
  | "developer"
  | "viewer"
  | "driver"
  | "maintainer";

export type BlockedReason =
  | "cannot-find-account"
  | "account-deactivated"
  | "no-roles-assigned"
  | "driver-only";

export type AccessResult =
  | { status: "active"; roles: WebRole[]; userId: string; accountManagerId: string | null }
  | { status: "blocked"; reason: BlockedReason };

export function determineUserAccess(userData: UserAccessData | null): AccessResult {
  if (!userData) {
    return { status: "blocked", reason: "cannot-find-account" };
  }

  if (userData.status_uuid === STATUSES.inactive) {
    return { status: "blocked", reason: "account-deactivated" };
  }

  const roles: WebRole[] = [];

  if (Boolean(userData.is_admin)) roles.push("admin");
  if (userData.account_manager_id) roles.push("account_manager");
  if (userData.developer_id) roles.push("developer");
  if (Boolean(userData.is_viewer)) roles.push("viewer");
  if (userData.maintainer_id) roles.push("maintainer");

  if (roles.length === 0) {
    if (userData.driver_id) {
      return { status: "blocked", reason: "driver-only" };
    }
    return { status: "blocked", reason: "no-roles-assigned" };
  }

  if (userData.driver_id) roles.push("driver");
  return {
    status: "active",
    roles,
    userId: userData.id,
    accountManagerId: userData.account_manager_id,
  };
}
