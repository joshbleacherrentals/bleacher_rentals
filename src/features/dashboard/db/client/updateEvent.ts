import { CurrentEventStore } from "../../../eventConfiguration/state/useCurrentEventStore";
import { UserResource } from "@clerk/types";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { updateDataBase } from "@/app/actions/db.actions";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database, Tables, TablesInsert } from "../../../../../database.types";
import { checkEventFormRules } from "../../functions";
import { db } from "@/components/providers/SystemProvider";
import { typedExecute, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { shouldReuseExistingAddressRow } from "@/features/venues/logic/shouldReuseExistingAddressRow";

type VenueUuidRow = { venue_uuid: string | null };

export async function updateEvent(
  state: CurrentEventStore,
  supabase: SupabaseClient<Database>,
  user: UserResource | null,
  bleacherEvents: Tables<"BleacherEvents">[],
): Promise<void> {
  if (!supabase) {
    createErrorToast(["No Supabase Client found"]);
  }

  if (state.eventUuid === null) {
    createErrorToast(["No eventUuid provided for update"]);
  }

  if (!checkEventFormRules(state, user)) {
    throw new Error("Event form validation failed");
  }

  // 1. Handle Address / Venue — see docs/specs/venue-history.md §3.5, §4.
  //    venueUuid set ("venue" mode): write venue_uuid only, skip the
  //    Addresses block — the events_sync_address_from_venue trigger sets
  //    address_uuid from it. No venueUuid + address present ("manual" mode):
  //    insert-or-update this event's own private Addresses row, exactly as
  //    before Venues existed — reusing the existing row only when it isn't
  //    the shared row of a Venue this event was just detached from
  //    (shouldReuseExistingAddressRow, §0.1). CoreTab already nulls
  //    addressUuid on detach; this is a defense-in-depth second check.
  let addressUuid: string | null = null;
  const venueUuid: string | null = state.venueUuid ?? null;

  if (!venueUuid && state.addressData) {
    const existingRows = state.eventUuid
      ? await typedGetAll(
          db
            .selectFrom("Events")
            .select(["venue_uuid"])
            .where("id", "=", state.eventUuid)
            .limit(1)
            .compile(),
          expect<VenueUuidRow>(),
        )
      : [];
    const wasLinkedToVenue = Boolean(existingRows[0]?.venue_uuid);

    if (shouldReuseExistingAddressRow(state.addressData.addressUuid, wasLinkedToVenue)) {
      addressUuid = state.addressData.addressUuid;
      await typedExecute(
        db
          .updateTable("Addresses")
          .set({
            city: state.addressData.city ?? "",
            state_province: state.addressData.state ?? "",
            street: state.addressData.address ?? "",
            zip_postal: state.addressData.postalCode ?? "",
            latitude: state.addressData.lat ?? null,
            longitude: state.addressData.lng ?? null,
            country: state.addressData.country ?? null,
            place_id: state.addressData.placeId ?? null,
          })
          .where("id", "=", state.addressData.addressUuid!)
          .compile(),
      );
    } else {
      addressUuid = crypto.randomUUID();
      await typedExecute(
        db
          .insertInto("Addresses")
          .values({
            id: addressUuid,
            city: state.addressData.city ?? "",
            state_province: state.addressData.state ?? "",
            street: state.addressData.address ?? "",
            zip_postal: state.addressData.postalCode ?? "",
            latitude: state.addressData.lat ?? null,
            longitude: state.addressData.lng ?? null,
            country: state.addressData.country ?? null,
            place_id: state.addressData.placeId ?? null,
          })
          .compile(),
      );
    }
  }

  // 2. Update Event
  await typedExecute(
    db
      .updateTable("Events")
      .set({
        event_name: state.eventName,
        event_start: state.eventStart,
        event_end: state.eventEnd,
        setup_start: state.sameDaySetup ? null : state.setupStart,
        teardown_end: state.sameDayTeardown ? null : state.teardownEnd,
        lenient: state.lenient ? 1 : 0,
        total_seats: state.seats,
        seven_row: state.sevenRow,
        ten_row: state.tenRow,
        fifteen_row: state.fifteenRow,
        event_status: state.selectedStatus,
        contract_revenue_cents: state.contractRevenueCents,
        notes: state.notes,
        hsl_hue: state.hslHue,
        must_be_clean: state.mustBeClean ? 1 : 0,
        goodshuffle_url: state.goodshuffleUrl ?? null,
        created_by_user_uuid: state.ownerUserUuid ?? null,
        booked_at: state.bookedAt ? new Date(state.bookedAt).toISOString() : null,
        ...(state.createdAt ? { created_at: new Date(state.createdAt).toISOString() } : {}),
        venue_uuid: venueUuid,
        ...(addressUuid ? { address_uuid: addressUuid } : {}),
      })
      .where("id", "=", state.eventUuid!)
      .compile(),
  );

  await updateBleacherEvents(state);

  createSuccessToast(["Event Updated"]);
  updateDataBase(["Bleachers", "BleacherEvents", "Addresses", "Venues", "Events"]);
}

async function updateBleacherEvents(state: CurrentEventStore) {
  const existingLinks = await typedGetAll(
    db
      .selectFrom("BleacherEvents")
      .select("bleacher_uuid")
      .where("event_uuid", "=", state.eventUuid!)
      .compile(),
    expect<{ bleacher_uuid: string | null }>(),
  );

  const existingBleacherUuids = new Set(
    existingLinks.map((b) => b.bleacher_uuid).filter((uuid): uuid is string => uuid !== null),
  );
  const incomingBleacherUuids = new Set(state.bleacherUuids);

  const toDelete = [...existingBleacherUuids].filter((id) => !incomingBleacherUuids.has(id));
  const toAdd = [...incomingBleacherUuids].filter((id) => !existingBleacherUuids.has(id));

  for (const bleacherUuid of toDelete) {
    await typedExecute(
      db
        .deleteFrom("BleacherEvents")
        .where("event_uuid", "=", state.eventUuid!)
        .where("bleacher_uuid", "=", bleacherUuid)
        .compile(),
    );
  }

  for (const bleacherUuid of toAdd) {
    await typedExecute(
      db
        .insertInto("BleacherEvents")
        .values({
          id: crypto.randomUUID(),
          bleacher_uuid: bleacherUuid,
          event_uuid: state.eventUuid!,
          setup_text: "",
          setup_confirmed: 0,
          teardown_text: "",
          teardown_confirmed: 0,
        })
        .compile(),
    );
  }
}
