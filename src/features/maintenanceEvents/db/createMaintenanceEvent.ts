import React from "react";
import { toast } from "sonner";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { SuccessToast } from "@/components/toasts/SuccessToast";
import { MaintenanceEventStore } from "../state/useMaintenanceEventStore";
import { Database, TablesInsert } from "../../../../database.types";

export async function createMaintenanceEvent(
  state: MaintenanceEventStore,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    throw new Error("No Supabase Client found");
  }

  if (!state.eventName.trim()) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Event name is required."],
        }),
      { duration: 5000 },
    );
    throw new Error("Event name is required");
  }

  if (!state.eventStart || !state.eventEnd) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Start and end dates are required."],
        }),
      { duration: 5000 },
    );
    throw new Error("Start and end dates are required");
  }

  if (state.bleacherUuids.length === 0) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["At least one bleacher must be selected."],
        }),
      { duration: 5000 },
    );
    throw new Error("At least one bleacher must be selected");
  }

  // 1. Insert Address (if provided)
  let addressUuid: string | null = null;
  if (state.addressData?.address) {
    const newAddress: Database["public"]["Tables"]["Addresses"]["Insert"] = {
      city: state.addressData.city ?? "",
      state_province: state.addressData.state ?? "",
      street: state.addressData.address ?? "",
      zip_postal: state.addressData.postalCode ?? "",
    };
    const { data: addressData, error: addressError } = await supabase
      .from("Addresses")
      .insert(newAddress)
      .select("id")
      .single();

    if (addressError || !addressData) {
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to insert address.", addressError?.message ?? ""],
          }),
        { duration: 10000 },
      );
      throw new Error(`Failed to insert address: ${addressError?.message}`);
    }
    addressUuid = addressData.id;
  }

  // 2. Insert MaintenanceEvent
  const newEvent: TablesInsert<"MaintenanceEvents"> = {
    event_name: state.eventName,
    event_start: state.eventStart,
    event_end: state.eventEnd,
    cost_cents: state.costCents,
    address_uuid: addressUuid,
    notes: state.notes || null,
  };

  const { data: eventData, error: eventError } = await supabase
    .from("MaintenanceEvents")
    .insert(newEvent)
    .select("id")
    .single();

  if (eventError || !eventData) {
    // Rollback address if created
    if (addressUuid) {
      await supabase.from("Addresses").delete().eq("id", addressUuid);
    }
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to create maintenance event.", eventError?.message ?? ""],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to create maintenance event: ${eventError?.message}`);
  }

  const maintenanceEventUuid = eventData.id;

  // 3. Insert BleacherMaintEvents junction rows
  const junctionInserts = state.bleacherUuids.map((bleacher_uuid) => ({
    bleacher_uuid,
    maintenance_event_uuid: maintenanceEventUuid,
  }));

  const { error: junctionError } = await supabase
    .from("BleacherMaintEvents")
    .insert(junctionInserts);

  if (junctionError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: [
            "Maintenance event created, but failed to link bleachers.",
            junctionError.message,
          ],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to link bleachers: ${junctionError.message}`);
  }

  // 4. Auto-resolve unresolved damage reports for selected bleachers
  const { error: resolveError } = await supabase
    .from("DamageReports")
    .update({
      resolved_at: new Date().toISOString(),
      maintenance_event_uuid: maintenanceEventUuid,
    })
    .in("bleacher_uuid", state.bleacherUuids)
    .is("resolved_at", null);

  if (resolveError) {
    console.warn("Failed to auto-resolve damage reports:", resolveError.message);
  }

  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Maintenance event created"],
      }),
    { duration: 5000 },
  );
}
