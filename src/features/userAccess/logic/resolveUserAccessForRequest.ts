import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { determineUserAccess, type AccessResult } from "./determineAccess";
import type { UserAccessData } from "../types";

type RoleRow = { id: string; is_active: boolean | null };

function activeRoleId(rows: RoleRow[] | null): string | null {
  return rows?.find((r) => r.is_active)?.id ?? null;
}

function mapUserAccessRow(row: {
  id: string;
  status_uuid: string | null;
  is_admin: boolean | null;
  is_viewer: boolean | null;
  AccountManagers: RoleRow[] | null;
  Drivers: RoleRow[] | null;
  Developers: RoleRow[] | null;
  Maintainers: RoleRow[] | null;
}): UserAccessData {
  return {
    id: row.id,
    status_uuid: row.status_uuid,
    is_admin: row.is_admin ? 1 : 0,
    is_viewer: row.is_viewer ? 1 : 0,
    account_manager_id: activeRoleId(row.AccountManagers),
    driver_id: activeRoleId(row.Drivers),
    developer_id: activeRoleId(row.Developers),
    maintainer_id: activeRoleId(row.Maintainers),
  };
}

/**
 * Loads the signed-in user's roles via Supabase (Clerk JWT + RLS).
 * Used by API route guards.
 */
export async function resolveUserAccessForRequest(clerkUserId: string): Promise<AccessResult> {
  const supabase = createServerSupabaseClient();

  const { data: row, error } = await supabase
    .from("Users")
    .select(
      `
      id,
      status_uuid,
      is_admin,
      is_viewer,
      AccountManagers!AccountManagers_user_uuid_fkey(id, is_active),
      Drivers!Drivers_user_uuid_fkey(id, is_active),
      Developers!Developers_user_uuid_fkey(id, is_active),
      Maintainers!maintainers_user_uuid_fkey(id, is_active)
    `,
    )
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error || !row) {
    return { status: "blocked", reason: "cannot-find-account" };
  }

  return determineUserAccess(mapUserAccessRow(row));
}
