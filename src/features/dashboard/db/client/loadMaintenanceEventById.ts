import { SupabaseClient } from "@supabase/supabase-js";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { Database } from "../../../../../database.types";

/**
 * Loads a maintenance event by ID from the database and populates the maintenance event store.
 */
export async function loadMaintenanceEventById(
  maintenanceEventUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase client available");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("MaintenanceEvents")
      .select(
        `
        *,
        address:Addresses!MaintenanceEvents_address_uuid_fkey(*),
        bleacher_maint_events:BleacherMaintEvents!BleacherMaintEvents_maintenance_event_uuid_fkey(bleacher_uuid)
      `,
      )
      .eq("id", maintenanceEventUuid)
      .single();

    if (error || !data) {
      console.warn("Could not find maintenance event data", error);
      return;
    }

    const bleacherUuids = data.bleacher_maint_events?.map((bme: any) => bme.bleacher_uuid) ?? [];

    // Close the regular event form if open
    useCurrentEventStore.getState().resetForm();

    const store = useMaintenanceEventStore.getState();
    const { setField } = store;

    setField("maintenanceEventUuid", data.id);
    setField("eventName", data.event_name);
    setField(
      "addressData",
      data.address
        ? {
            addressUuid: data.address.id,
            address: data.address.street,
            city: data.address.city,
            state: data.address.state_province,
            postalCode: data.address.zip_postal ?? undefined,
          }
        : null,
    );
    setField("eventStart", data.event_start);
    setField("eventEnd", data.event_end);
    setField("costCents", data.cost_cents);
    setField("notes", data.notes ?? "");
    setField("ownerUserUuid", data.created_by_user_uuid ?? null);
    setField("bleacherUuids", bleacherUuids);
    setField("isFormExpanded", true);
  } catch (error) {
    console.error("Failed to load maintenance event:", error);
  }
}
