import React from "react";
import { toast } from "sonner";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { SuccessToast } from "@/components/toasts/SuccessToast";
import { Database } from "../../../../database.types";

export async function deleteMaintenanceEvent(
  maintenanceEventUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    throw new Error("No Supabase Client found");
  }

  // 1. Delete BleacherMaintEvents junction rows
  const { error: junctionError } = await supabase
    .from("BleacherMaintEvents")
    .delete()
    .eq("maintenance_event_uuid", maintenanceEventUuid);

  if (junctionError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to remove bleacher links.", junctionError.message],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to delete junction rows: ${junctionError.message}`);
  }

  // 2. Unlink any DamageReports that pointed at this maintenance event
  const { error: unlinkError } = await supabase
    .from("DamageReports")
    .update({ resolved_at: null, maintenance_event_uuid: null })
    .eq("maintenance_event_uuid", maintenanceEventUuid);

  if (unlinkError) {
    console.warn("Failed to unlink damage reports:", unlinkError.message);
  }

  // 3. Delete the MaintenanceEvent itself
  const { error: deleteError } = await supabase
    .from("MaintenanceEvents")
    .delete()
    .eq("id", maintenanceEventUuid);

  if (deleteError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to delete maintenance event.", deleteError.message],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to delete maintenance event: ${deleteError.message}`);
  }

  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Maintenance event deleted"],
      }),
    { duration: 5000 },
  );
}
