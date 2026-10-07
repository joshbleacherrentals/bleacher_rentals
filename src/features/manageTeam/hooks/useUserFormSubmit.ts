"use client";

import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserStore } from "../state/useCurrentUserStore";
import { validateForm } from "../util/validation";
import { createUser, updateUser, updateDriverPayment, sendUserInvite } from "../db/userOperations";
import type { EditAccess } from "./useTeamPermissions";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useRouter } from "next/navigation";

export function useUserFormSubmit() {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const state = useCurrentUserStore();
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);
  const setField = useCurrentUserStore((s) => s.setField);

  // `access` is the level the form was opened with. "driver-only" (an accountant) saves the payment
  // info and the vendor of the driver and nothing else; every other level saves through updateUser.
  const handleSubmit = async (access?: EditAccess) => {
    // Validate form
    const validation = validateForm(state);
    if (!validation.isValid) {
      createErrorToastNoThrow(["Validation Error", ...validation.errors]);
      return false;
    }

    setField("isSubmitting", true);

    try {
      if (existingUserUuid) {
        // Update existing user
        const result =
          access === "driver-only"
            ? await updateDriverPayment(supabase, state)
            : await updateUser(supabase, state);
        if (!result.success) {
          throw new Error(result.error || "Failed to update user");
        }

        // Invalidate bleachers query if account manager changes were made
        if (access !== "driver-only" && state.isAccountManager) {
          await queryClient.invalidateQueries({ queryKey: ["bleachers"] });
          await queryClient.invalidateQueries({ queryKey: ["bleachers-with-assignments"] });
        }

        createSuccessToast(["User updated successfully"]);
      } else {
        // Create new user
        const result = await createUser(supabase, state);
        if (!result.success) {
          throw new Error(result.error || "Failed to create user");
        }

        // Invalidate bleachers query if account manager was created
        if (state.isAccountManager) {
          await queryClient.invalidateQueries({ queryKey: ["bleachers"] });
          await queryClient.invalidateQueries({ queryKey: ["bleachers-with-assignments"] });
        }

        // Send invite email
        const inviteResult = await sendUserInvite(state.email);
        if (!inviteResult.success) {
          console.error("Failed to send invite:", inviteResult.error);
          createErrorToastNoThrow([
            "User created but invite failed",
            inviteResult.error || "Unknown error",
          ]);
        } else {
          createSuccessToast(["User created and invite sent"]);
        }
      }

      // Success - navigate back to team page (cleanup will happen in layout useEffect)
      router.push("/team");
      return true;
    } catch (error) {
      console.error("Error saving user:", error);
      createErrorToastNoThrow([
        "Error saving user",
        error instanceof Error ? error.message : "Unknown error",
      ]);
      // Don't navigate on error - stay on current page
      return false;
    } finally {
      setField("isSubmitting", false);
    }
  };

  const handleCancel = () => {
    // Navigate to team page (cleanup will happen in layout useEffect)
    router.push("/team");
  };

  return {
    handleSubmit,
    handleCancel,
    isSubmitting: state.isSubmitting,
    existingUserUuid,
  };
}
