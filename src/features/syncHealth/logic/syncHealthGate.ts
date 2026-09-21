import type { UserAccessState } from "@/features/userAccess/hooks/useUserAccess";

export type SyncHealthGate = "loading" | "allowed" | "redirect";

/**
 * The page's own check. The route guard matches by prefix and admins/viewers
 * hold "/dev-tools", so without this they would get in; only the developer
 * role (an active Developers row, `developer_id` in useUserAccess) is allowed.
 */
export function syncHealthGate(access: UserAccessState): SyncHealthGate {
  if (access.status === "loading") return "loading";
  if (access.status === "active" && access.roles.includes("developer")) return "allowed";
  return "redirect";
}
