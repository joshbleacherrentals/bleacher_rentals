import React from "react";
import { toast } from "sonner";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { SuccessToast } from "@/components/toasts/SuccessToast";
import { MaintenanceEventStore } from "../state/useMaintenanceEventStore";
import { Database } from "../../../../database.types";

export async function updateMaintenanceEvent(
  state: MaintenanceEventStore,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    throw new Error("No Supabase Client found");
  }

  if (!state.maintenanceEventUuid) {
    throw new Error("No maintenance event UUID to update");
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

  const maintenanceEventUuid = state.maintenanceEventUuid;

  // 1. Update or insert address
  let addressUuid: string | null = null;
  if (state.addressData?.address) {
    if (state.addressData.addressUuid) {
      // Update existing address
      const { error: addrError } = await supabase
        .from("Addresses")
        .update({
          city: state.addressData.city ?? "",
          state_province: state.addressData.state ?? "",
          street: state.addressData.address ?? "",
          zip_postal: state.addressData.postalCode ?? "",
        })
        .eq("id", state.addressData.addressUuid);

      if (addrError) {
        toast.custom(
          (t) =>
            React.createElement(ErrorToast, {
              id: t,
              lines: ["Failed to update address.", addrError.message],
            }),
          { duration: 10000 },
        );
        throw new Error(`Failed to update address: ${addrError.message}`);
      }
      addressUuid = state.addressData.addressUuid;
    } else {
      // Insert new address
      const { data: addressData, error: addressError } = await supabase
        .from("Addresses")
        .insert({
          city: state.addressData.city ?? "",
          state_province: state.addressData.state ?? "",
          street: state.addressData.address ?? "",
          zip_postal: state.addressData.postalCode ?? "",
        })
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
  }

  // 2. Update MaintenanceEvent row
  const { error: updateError } = await supabase
    .from("MaintenanceEvents")
    .update({
      event_name: state.eventName,
      event_start: state.eventStart,
      event_end: state.eventEnd,
      cost_cents: state.costCents,
      address_uuid: addressUuid,
      notes: state.notes || null,
    })
    .eq("id", maintenanceEventUuid);

  if (updateError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to update maintenance event.", updateError.message],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to update maintenance event: ${updateError.message}`);
  }

  // 3. Reconcile BleacherMaintEvents junction rows (delete old, insert new)
  const { error: deleteJunctionError } = await supabase
    .from("BleacherMaintEvents")
    .delete()
    .eq("maintenance_event_uuid", maintenanceEventUuid);

  if (deleteJunctionError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to update bleacher links.", deleteJunctionError.message],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to delete old junction rows: ${deleteJunctionError.message}`);
  }

  const junctionInserts = state.bleacherUuids.map((bleacher_uuid) => ({
    bleacher_uuid,
    maintenance_event_uuid: maintenanceEventUuid,
  }));

  const { error: insertJunctionError } = await supabase
    .from("BleacherMaintEvents")
    .insert(junctionInserts);

  if (insertJunctionError) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to re-link bleachers.", insertJunctionError.message],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to re-link bleachers: ${insertJunctionError.message}`);
  }

  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Maintenance event updated"],
      }),
    { duration: 5000 },
  );
}
