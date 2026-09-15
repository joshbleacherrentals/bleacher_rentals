import { toast } from "sonner";
import React from "react";
import { createErrorToast, ErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast, SuccessToast } from "@/components/toasts/SuccessToast";
import {
  AddressData,
  CurrentEventStore,
} from "../../../eventConfiguration/state/useCurrentEventStore";
import { normalizeLostFields } from "@/features/quotesAndBookings/utils/lostReason";
import { useMemo } from "react";
import { UserResource } from "@clerk/types";
import { updateDataBase } from "@/app/actions/db.actions";
import { SupabaseClient } from "@supabase/supabase-js";
import { Enums } from "../../../../../database.types";
import {
  DashboardBleacher,
  DashboardBlock,
  DashboardEvent,
  EditBlock,
  SetupTeardownBlock,
} from "../../types";
import { Database, Tables, TablesInsert } from "../../../../../database.types";
import { calculateNumDays, checkEventFormRules } from "../../functions";
import { useDashboardEventsStore } from "../../state/useDashboardEventsStore";
import {
  buildTripDeletedNotification,
  buildTripStatusNotification,
  insertDriverNotification,
} from "@/features/workTrackers/db/notifications";
import { db } from "@/components/providers/SystemProvider";
import { usePsAddresses } from "@/features/dashboard/db/hooks/powersync/usePsAddresses";
import { typedExecute, typedExecuteBatch, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { startTrace } from "@/lib/perf/perfTrace";
import { planWorkTrackerSave } from "@/features/workTrackers/db/planWorkTrackerSave";
import { scheduleTriage } from "@/features/alerts/scheduleTriage";
import { triage } from "@/features/alerts/triage";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { buildActualBleacherUpdate } from "@/features/workTrackers/util/bleacherSwap";
import {
  resolveStatusOnSave,
  shouldSendDriverNotification,
  type WorkTrackerChangeType,
} from "@/features/workTrackers/util/workTrackerEditPolicy";

// 🔁 1. For each bleacher, find all bleacherEvents with its bleacher_id.
// 🔁 2. From those bleacherEvents, get the event_ids.
// 🔁 3. Match those event_ids to full events from your events store.
// 🔁 4. Enrich each event with its address from the addresses store.
// ✅ 5. Add those events as the events field in each DashboardBleacher.

/**
 * Looks an address up in the local PowerSync DB.
 *
 * A hook, not a bare function, because it used to read a Zustand mirror of the
 * whole `Addresses` table through `getState()` — a table that silently
 * truncated at 1000 rows, so roughly half of all lookups returned null.
 */
export function useAddressFromUuid(addressUuid: string | null): AddressData | null {
  const addresses = usePsAddresses();
  if (!addressUuid) return null;
  const address = addresses.find((a) => a.id === addressUuid);
  if (!address) return null;
  return {
    addressUuid: address.id,
    address: address.street ?? "",
    city: address.city ?? undefined,
    state: address.state_province ?? undefined,
    postalCode: address.zip_postal ?? undefined,
    lat: address.latitude ?? undefined,
    lng: address.longitude ?? undefined,
    country: address.country ?? undefined,
    placeId: address.place_id ?? undefined,
  };
}

async function fetchDriverUserUuidByDriverUuid(driverUuid: string | null): Promise<string | null> {
  if (!driverUuid) return null;

  const rows = await typedGetAll(
    db.selectFrom("Drivers").select(["user_uuid"]).where("id", "=", driverUuid).limit(1).compile(),
    expect<{ user_uuid: string | null }>(),
  );

  return rows[0]?.user_uuid ?? null;
}

function toNotificationAddress(address: AddressData | null, fallback: string): string {
  const formatted = (address?.address ?? "").trim();
  if (formatted.length > 0) return formatted;
  return fallback;
}

function toNotificationCity(address: AddressData | null, fallback?: string): string | undefined {
  const formatted = (address?.city ?? "").trim();
  if (formatted.length > 0) return formatted;

  const fallbackFormatted = (fallback ?? "").trim();
  return fallbackFormatted.length > 0 ? fallbackFormatted : undefined;
}

export async function fetchAddressFromUuid(
  uuid: string,
  supabase: SupabaseClient<Database>,
  isServer?: boolean,
): Promise<Tables<"Addresses"> | null> {
  const { data, error } = await supabase.from("Addresses").select("*").eq("id", uuid).single();

  if (error) {
    if (isServer) {
      throw new Error(["Failed to fetch address.", error.message].join("\n"));
    }
    createErrorToast(["Failed to fetch address.", error.message]);
  }
  // console.log("fetchAddressFromId", data);
  return data;
}

export async function saveWorkTracker(
  workTracker: Tables<"WorkTrackers"> | null,
  pickUpAddress: AddressData | null,
  dropOffAddress: AddressData | null,
  options?: {
    previousStatus?: Enums<"worktracker_status">;
    changeType?: WorkTrackerChangeType;
    driverUserUuid?: string | null;
    previousPickupAddress?: string;
    previousPickupCity?: string;
    previousDropoffAddress?: string;
    previousDropoffCity?: string;
  },
): Promise<string> {
  if (!workTracker) {
    createErrorToast(["Failed to save work tracker. No work tracker provided."]);
  }
  // const payCents = Math.round(payInput * 100);

  const trace = startTrace("saveWorkTracker");

  const wasInsert = workTracker.id === "-1";

  // Reads first, because the plan below needs their answers and nothing may sit
  // between the plan and its single commit.
  let previousBleacherUuid: string | null = null;
  if (!wasInsert) {
    const previousRows = await typedGetAll(
      db
        .selectFrom("WorkTrackers")
        .select(["bleacher_uuid"])
        .where("id", "=", workTracker.id)
        .limit(1)
        .compile(),
      expect<{ bleacher_uuid: string | null }>(),
    );
    previousBleacherUuid = previousRows[0]?.bleacher_uuid ?? null;
  }

  const previousStatus = options?.previousStatus ?? "draft";
  const changeType = options?.changeType;
  const effectiveStatus =
    changeType === undefined
      ? workTracker.status
      : resolveStatusOnSave(previousStatus, changeType, workTracker.status);

  const notification =
    changeType === undefined ||
    shouldSendDriverNotification(changeType, previousStatus, wasInsert, effectiveStatus)
      ? buildTripStatusNotification({
          previousStatus: wasInsert ? "draft" : previousStatus,
          nextStatus: effectiveStatus,
          pickupAddress: toNotificationAddress(
            pickUpAddress,
            options?.previousPickupAddress ?? "an unknown pickup location",
          ),
          pickupCity: toNotificationCity(pickUpAddress, options?.previousPickupCity),
          dropoffAddress: toNotificationAddress(
            dropOffAddress,
            options?.previousDropoffAddress ?? "an unknown dropoff location",
          ),
          dropoffCity: toNotificationCity(dropOffAddress, options?.previousDropoffCity),
          date: workTracker.date,
        })
      : null;

  const notificationUserUuid = notification
    ? (options?.driverUserUuid ?? (await fetchDriverUserUuidByDriverUuid(workTracker.driver_uuid)))
    : null;
  trace.mark("reads");

  // Addresses, the tracker row and the driver notification used to be three or
  // four separate transactions, each one an IndexedDB round-trip that also woke
  // every watched query on the tables it touched. They are one transaction now;
  // `planWorkTrackerSave` explains why generating the ids up front is what made
  // that possible.
  const plan = planWorkTrackerSave({
    workTracker,
    pickUpAddress,
    dropOffAddress,
    effectiveStatus,
    createdByUserUuid:
      workTracker.created_by_user_uuid ?? usePermissionsStore.getState().userId ?? null,
    notification,
    notificationUserUuid,
    newId: () => crypto.randomUUID(),
  });

  await typedExecuteBatch(plan.statements);
  const savedWorkTrackerUuid = plan.workTrackerUuid;
  trace.mark(wasInsert ? "insert tracker" : "update tracker");

  // Not awaited: the alert cascade is advisory work that nothing below depends
  // on. `scheduleTriage` documents the trade-off. The phase label is unchanged
  // so traces stay comparable with the ones captured before this change — it
  // now measures scheduling, and the cascade reports its own trace when it
  // finishes.
  scheduleTriage("WorkTrackers", {
    id: savedWorkTrackerUuid,
    previous_bleacher_uuid: previousBleacherUuid,
  });
  trace.mark("alert triage");

  // Broadcasts over Pusher. Nothing listens any more — the Zustand stores that
  // used to refetch on it are gone — so this is dead weight until Phase 2 of
  // `docs/specs/retire-legacy-zustand-sync.md` removes the broadcast itself.
  updateDataBase(["WorkTrackers", "Addresses"]);
  createSuccessToast(["Work Tracker saved"]);

  trace.end({ workTrackerUuid: savedWorkTrackerUuid, wasInsert });

  return savedWorkTrackerUuid;
}

export async function moveWorkTracker(params: {
  workTrackerUuid: string;
  targetBleacherUuid: string;
  targetDate: string;
  previousStatus: Enums<"worktracker_status">;
  previousBleacherUuid: string;
  driverUuid?: string | null;
  driverUserUuid?: string | null;
  pickupAddress?: string;
  pickupCity?: string;
  dropoffAddress?: string;
  dropoffCity?: string;
  date?: string | null;
}): Promise<void> {
  const nextStatus = params.previousStatus === "accepted" ? "released" : params.previousStatus;
  const trace = startTrace("moveWorkTracker");

  await typedExecute(
    db
      .updateTable("WorkTrackers")
      .set({
        bleacher_uuid: params.targetBleacherUuid,
        date: params.targetDate,
        status: nextStatus,
      })
      .where("id", "=", params.workTrackerUuid)
      .compile(),
  );
  trace.mark("update tracker");

  if (shouldSendDriverNotification("un-accept", params.previousStatus, false, nextStatus)) {
    const notification = buildTripStatusNotification({
      previousStatus: params.previousStatus,
      nextStatus,
      pickupAddress: params.pickupAddress ?? "an unknown pickup location",
      pickupCity: params.pickupCity,
      dropoffAddress: params.dropoffAddress ?? "an unknown dropoff location",
      dropoffCity: params.dropoffCity,
      date: params.date ?? params.targetDate,
    });

    if (notification) {
      const driverUserUuid =
        params.driverUserUuid ?? (await fetchDriverUserUuidByDriverUuid(params.driverUuid ?? null));

      if (driverUserUuid) {
        await insertDriverNotification(driverUserUuid, notification);
      }
    }
  }
  trace.mark("driver notification");

  scheduleTriage("WorkTrackers", {
    id: params.workTrackerUuid,
    previous_bleacher_uuid: params.previousBleacherUuid,
  });
  trace.mark("alert triage");

  updateDataBase(["WorkTrackers"]);

  trace.end({ workTrackerUuid: params.workTrackerUuid });
}

export async function deleteWorkTracker(
  workTrackerUuid: string | null,
  options?: {
    driverUserUuid?: string | null;
    driverUuid?: string | null;
    pickupAddress?: string;
    pickupCity?: string;
    dropoffAddress?: string;
    dropoffCity?: string;
    date?: string | null;
  },
): Promise<void> {
  if (!workTrackerUuid || workTrackerUuid === "-1") {
    createErrorToast(["Invalid work tracker ID"]);
    throw new Error("Invalid work tracker ID");
  }

  const driverUserUuid =
    options?.driverUserUuid ?? (await fetchDriverUserUuidByDriverUuid(options?.driverUuid ?? null));

  if (driverUserUuid) {
    await insertDriverNotification(
      driverUserUuid,
      buildTripDeletedNotification({
        pickupAddress: options?.pickupAddress ?? "an unknown pickup location",
        pickupCity: options?.pickupCity,
        dropoffAddress: options?.dropoffAddress ?? "an unknown dropoff location",
        dropoffCity: options?.dropoffCity,
        date: options?.date ?? null,
      }),
    );
  }

  const selectQuery = db
    .selectFrom("WorkTrackers")
    .select("bleacher_uuid")
    .where("id", "=", workTrackerUuid)
    .compile();
  const wtRows = await typedGetAll(selectQuery, expect<{ bleacher_uuid: string | null }>());
  const bleacherUuid = wtRows[0]?.bleacher_uuid ?? null;

  const deleteQuery = db.deleteFrom("WorkTrackers").where("id", "=", workTrackerUuid).compile();
  await typedExecute(deleteQuery);

  // Still awaited: deletion triage removes alerts for a row that is going away,
  // and it is not dedup-keyed the way the save cascade is. Only the lazy import
  // is dropped here.
  try {
    await triage("WorkTrackers_deleted", { id: workTrackerUuid, bleacher_uuid: bleacherUuid });
  } catch (e) {
    console.error("[alerts] failed to triage after work tracker delete", e);
  }

  updateDataBase(["WorkTrackers"]);
  createSuccessToast(["Work Tracker deleted"]);
}

export async function saveSetupTeardownBlock(
  block: SetupTeardownBlock | null,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase Client found");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No Supabase Client found"],
        }),
      { duration: 10000 },
    );
    throw new Error("No Supabase Client found");
  }

  if (!block) {
    console.error("No setup block provided for save");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No setup block provided for save"],
        }),
      { duration: 10000 },
    );
    throw new Error("No setup block selected to save.");
  }

  if (block.bleacherEventUuid) {
    const data =
      block.type === "setup"
        ? {
            setup_text: block.text,
            setup_confirmed: block.confirmed,
          }
        : {
            teardown_text: block.text,
            teardown_confirmed: block.confirmed,
          };
    const { error } = await supabase
      .from("BleacherEvents")
      .update(data)
      .eq("bleacher_event_uuid", block.bleacherEventUuid);
    if (error) {
      console.error("Failed to update BleacherEvent:", error);
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: [`Failed to update ${block.type} block`, error.message],
          }),
        { duration: 10000 },
      );
      throw new Error(`Failed to update ${block.type} block: ${error.message}`);
    }
  } else {
    console.error(`Failed to update ${block.type} block: No BleacherEventUuid provided.`);
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: [`Failed to update ${block.type} block: No BleacherEventUuid provided.`],
        }),
      { duration: 10000 },
    );
    throw new Error(`Failed to update ${block.type} block: No BleacherEventUuid provided.`);
  }
  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Setup Block saved"],
      }),
    { duration: 10000 },
  );
  updateDataBase(["BleacherEvents"]);
}

export async function saveBlock(
  block: EditBlock | null,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase Client found");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No Supabase Client found"],
        }),
      { duration: 10000 },
    );
    throw new Error("No Supabase Client found");
  }

  if (!block) {
    console.error("No block provided for save");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No block provided for save"],
        }),
      { duration: 10000 },
    );
    throw new Error("No block selected to save.");
  }

  if (block.blockUuid) {
    const { error } = await supabase
      .from("Blocks")
      .update({ text: block.text })
      .eq("id", block.blockUuid);
    if (error) {
      console.error("Failed to update block:", error);
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to update block", error.message],
          }),
        { duration: 10000 },
      );
      throw new Error(`Failed to update block: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("Blocks").insert({
      bleacher_uuid: block.bleacherUuid,
      date: block.date,
      text: block.text,
    });
    if (error) {
      console.error("Failed to insert block:", error);
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to insert block", error.message],
          }),
        { duration: 10000 },
      );
      throw new Error(`Failed to insert block: ${error.message}`);
    }
  }
  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Block saved"],
      }),
    { duration: 10000 },
  );
  updateDataBase(["Blocks"]);
}

export async function deleteBlock(
  block: EditBlock | null,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase Client found");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No Supabase Client found"],
        }),
      { duration: 10000 },
    );
    throw new Error("No Supabase Client found");
  }

  if (!block) {
    console.error("No block provided for save");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["No block provided for save"],
        }),
      { duration: 10000 },
    );
    throw new Error("No block selected to save.");
  }

  if (block.blockUuid) {
    const { error } = await supabase.from("Blocks").delete().eq("id", block.blockUuid);
    if (error) {
      console.error("Failed to delete block:", error);
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to delete block", error.message],
          }),
        { duration: 10000 },
      );
      throw new Error(`Failed to delete block: ${error.message}`);
    }
  } else {
    console.error("No Block ID provided for delete.");
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: ["Failed to delete block, no block ID provided."],
        }),
      { duration: 10000 },
    );
    throw new Error(`No Block ID provided for delete.`);
  }
  toast.custom(
    (t) =>
      React.createElement(SuccessToast, {
        id: t,
        lines: ["Block Deleted"],
      }),
    { duration: 10000 },
  );
  updateDataBase(["Blocks"]);
}

export async function createEvent(
  state: CurrentEventStore,
  supabase: SupabaseClient<Database>,
  user: UserResource | null,
): Promise<string> {
  if (!supabase) {
    console.warn("No Supabase Client found");
    throw new Error("No Supabase Client found");
  }

  if (!checkEventFormRules(state, user)) {
    throw new Error("Event form validation failed");
  }

  // 1. Insert Address
  const address_uuid = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Addresses")
      .values({
        id: address_uuid,
        city: state.addressData?.city ?? "",
        state_province: state.addressData?.state ?? "",
        street: state.addressData?.address ?? "",
        zip_postal: state.addressData?.postalCode ?? "",
      })
      .compile(),
  );

  // 2. Insert Event
  const event_uuid = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("Events")
      .values({
        id: event_uuid,
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
        address_uuid,
        event_status: state.selectedStatus,
        ...normalizeLostFields({ ...state, status: state.selectedStatus }),
        contract_revenue_cents: state.contractRevenueCents,
        notes: state.notes,
        hsl_hue: state.hslHue,
        must_be_clean: state.mustBeClean ? 1 : 0,
        goodshuffle_url: state.goodshuffleUrl ?? null,
        created_by_user_uuid: state.ownerUserUuid ?? null,
        deleted: 0,
        booked_at: state.bookedAt ? new Date(state.bookedAt).toISOString() : null,
        ...(state.createdAt ? { created_at: new Date(state.createdAt).toISOString() } : {}),
      })
      .compile(),
  );

  // 3. Insert BleacherEvents
  for (const bleacher_uuid of state.bleacherUuids) {
    await typedExecute(
      db
        .insertInto("BleacherEvents")
        .values({
          id: crypto.randomUUID(),
          event_uuid,
          bleacher_uuid,
        })
        .compile(),
    );
  }

  createSuccessToast(["Event Created"]);
  updateDataBase(["Bleachers", "BleacherEvents", "Addresses", "Events"]);
  return event_uuid;
}

export async function deleteEvent(
  eventUuid: string | null,
  stateProv: string,
  supabase: SupabaseClient<Database>,
  user: UserResource | null,
): Promise<void> {
  if (!supabase) {
    console.warn("No Supabase Client found");
    throw new Error("No Supabase Client found");
  }

  if (!eventUuid) {
    console.error("No eventUuid provided for deletion");
    throw new Error("No event selected to delete.");
  }

  // Soft delete — mark as deleted instead of removing rows
  await typedExecute(
    db.updateTable("Events").set({ deleted: 1 }).where("id", "=", eventUuid).compile(),
  );

  createSuccessToast(["Event Deleted"]);
  updateDataBase(["Events"]);
}
