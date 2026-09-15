import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/../database.types";
import { STATUSES } from "@/features/manageTeam/constants";

type TypedSupabaseClient = SupabaseClient<Database>;

export async function deactivateUser(
  supabase: TypedSupabaseClient,
  userUuid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("Users")
      .update({ status_uuid: STATUSES.inactive })
      .eq("id", userUuid);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error deactivating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function reactivateUser(
  supabase: TypedSupabaseClient,
  userUuid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("Users")
      .update({ status_uuid: STATUSES.active })
      .eq("id", userUuid);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error reactivating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateUserStatusToInvited(
  supabase: TypedSupabaseClient,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("Users")
      .update({ status_uuid: STATUSES.invited })
      .eq("email", email);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error updating user status to invited:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteUser(
  supabase: TypedSupabaseClient,
  userUuid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Mark user as inactive instead of deleting
    const { error: userError } = await supabase
      .from("Users")
      .update({ status_uuid: STATUSES.inactive })
      .eq("id", userUuid);

    if (userError) throw userError;

    // Mark driver as inactive if exists
    const { error: driverError } = await supabase
      .from("Drivers")
      .update({ is_active: false })
      .eq("user_uuid", userUuid);

    // Ignore error if driver doesn't exist
    if (driverError && driverError.code !== "PGRST116") throw driverError;

    // Mark account manager as inactive if exists
    const { error: amError } = await supabase
      .from("AccountManagers")
      .update({ is_active: false })
      .eq("user_uuid", userUuid);

    // Ignore error if account manager doesn't exist
    if (amError && amError.code !== "PGRST116") throw amError;

    return { success: true };
  } catch (error) {
    console.error("Error deactivating user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
