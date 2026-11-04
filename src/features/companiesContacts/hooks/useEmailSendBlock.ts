"use client";

import { emailSendBlock } from "@/features/userAccess/logic/canSendEmail";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";

/**
 * Why the signed-in user cannot send email, or null when they can: their role may not (only an
 * admin, account manager or accountant may), or their account's email is not a company address
 * (see emailSendBlock). The server checks both again for every send. While their account is still
 * loading, the email is not held against them.
 */
export function useEmailSendBlock(): string | null {
  const roles = usePermissionsStore((state) => state.roles);
  const { data: currentUser, isLoading } = useCurrentUser();
  return emailSendBlock({
    roles,
    email: isLoading ? undefined : (currentUser?.[0]?.email ?? null),
  });
}
