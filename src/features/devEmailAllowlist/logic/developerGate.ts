import type { UserAccessState } from "@/features/userAccess/hooks/useUserAccess";

export type DeveloperGate = "loading" | "allowed" | "redirect";

/**
 * The Allowed Emails page's own check. The route guard matches /dev-tools by prefix and admins and
 * viewers hold that prefix, so without this they would get in; only an active developer is allowed.
 * RLS is the real fence — this keeps everyone else from seeing an empty page.
 */
export function developerGate(access: UserAccessState): DeveloperGate {
  if (access.status === "loading") return "loading";
  if (access.status === "active" && access.roles.includes("developer")) return "allowed";
  return "redirect";
}
