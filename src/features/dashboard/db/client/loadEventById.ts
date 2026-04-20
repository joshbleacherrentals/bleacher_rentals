import { SupabaseClient } from "@supabase/supabase-js";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { Database } from "../../../../../database.types";

/**
 * Loads an event by ID from the database and populates the current event store
 * @param eventId - The event ID to load
 * @param supabase - Supabase client instance
 */
export async function loadEventById(
  eventUuid: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase client available");
    return;
  }

  try {
    // Fetch the full event with address and bleacher relationships in one query
    const { data: eventData, error: eventError } = await supabase
      .from("Events")
      .select(
        `
        *,
        address:Addresses!Events_address_uuid_fkey(*),
        bleacher_events:BleacherEvents!BleacherEvents_event_uuid_fkey(bleacher_uuid)
      `,
      )
      .eq("id", eventUuid)
      .single();

    if (eventError || !eventData) {
      console.warn("Could not find event data", eventError);
      return;
    }

    // Extract bleacher IDs from the relationship
    const eventBleacherUuids = eventData.bleacher_events?.map((be: any) => be.bleacher_uuid) ?? [];

    // Load all event data into the store
    // Close the maintenance event form if open
    useMaintenanceEventStore.getState().resetForm();

    const store = useCurrentEventStore.getState();
    const { setField } = store;

    setField("eventUuid", eventData.id);
    setField("eventName", eventData.event_name);
    setField(
      "addressData",
      eventData.address
        ? {
            addressUuid: eventData.address.id,
            address: eventData.address.street,
            city: eventData.address.city,
            state: eventData.address.state_province,
            postalCode: eventData.address.zip_postal ?? undefined,
          }
        : null,
    );
    setField("seats", eventData.total_seats);
    setField("sevenRow", eventData.seven_row);
    setField("tenRow", eventData.ten_row);
    setField("fifteenRow", eventData.fifteen_row);
    setField("setupStart", eventData.setup_start ?? "");
    setField("sameDaySetup", !eventData.setup_start);
    setField("eventStart", eventData.event_start);
    setField("eventEnd", eventData.event_end);
    setField("teardownEnd", eventData.teardown_end ?? "");
    setField("sameDayTeardown", !eventData.teardown_end);
    setField("lenient", eventData.lenient);
    setField("selectedStatus", eventData.event_status ?? (eventData.booked ? "booked" : "quoted"));
    setField("contractRevenueCents", eventData.contract_revenue_cents ?? null);
    setField("notes", eventData.notes ?? "");
    setField("mustBeClean", eventData.must_be_clean);
    setField("bleacherUuids", eventBleacherUuids);
    setField("isFormExpanded", true); // Open the configuration panel
    setField("hslHue", eventData.hsl_hue);
    setField("goodshuffleUrl", eventData.goodshuffle_url);
    setField("ownerUserUuid", eventData.created_by_user_uuid ?? null);
    setField("bookedAt", eventData.booked_at ? eventData.booked_at.split("T")[0] : null);
  } catch (error) {
    console.error("Failed to load event:", error);
  }
}
