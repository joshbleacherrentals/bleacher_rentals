import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { AddressData } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { buildActualBleacherUpdate } from "@/features/workTrackers/util/bleacherSwap";
import type { DriverNotificationPreview } from "@/features/workTrackers/db/notifications";
import type { Enums, Tables } from "../../../../database.types";

/**
 * Every row a work tracker save writes, collected before anything is committed.
 *
 * Saving used to issue three or four separate `typedExecute` calls — up to two
 * addresses, the tracker, and the driver notification. On `IDBBatchAtomicVFS`
 * each one is its own IndexedDB round-trip *and* its own commit, and every
 * commit wakes every watched query on the tables it touched. Measured as four
 * transactions: addresses 124ms → insert tracker 134ms → driver notification
 * 441ms.
 *
 * The obstacle to batching was ordering: the tracker row references address ids
 * that `saveAddress` only returned after inserting. Generating the ids up front
 * removes it — the statements can then be planned in dependency order and
 * handed to `typedExecuteBatch` as one transaction, the same move that took
 * `syncWorkTrackerLineItems` from 932ms to 248ms.
 *
 * Planning is pure: no I/O, no stores, no `crypto` (the id source is injected),
 * so the whole shape of a save is unit-testable without a browser.
 */
export type WorkTrackerSaveInput = {
  workTracker: Tables<"WorkTrackers">;
  pickUpAddress: AddressData | null;
  dropOffAddress: AddressData | null;
  /** The status after `resolveStatusOnSave`, not the one on the draft row. */
  effectiveStatus: Enums<"worktracker_status">;
  createdByUserUuid: string | null;
  /** Null when this save does not warrant telling the driver. */
  notification: DriverNotificationPreview | null;
  /** Null when the driver has no linked user; the notification is then dropped. */
  notificationUserUuid: string | null;
  newId: () => string;
};

export type WorkTrackerSavePlan = {
  /** In dependency order: addresses, then the tracker, then the notification. */
  statements: CompiledQuery<any>[];
  workTrackerUuid: string;
  pickupAddressUuid: string | null;
  dropoffAddressUuid: string | null;
  wasInsert: boolean;
};

/** The sentinel the modal uses for a tracker that has never been saved. */
const NEW_WORK_TRACKER_ID = "-1";

function addressColumns(address: AddressData) {
  return {
    city: address.city ?? "",
    state_province: address.state ?? "",
    street: address.address ?? "",
    zip_postal: address.postalCode ?? "",
    latitude: address.lat ?? null,
    longitude: address.lng ?? null,
    country: address.country ?? null,
    place_id: address.placeId ?? null,
  };
}

type PlannedAddress = { uuid: string | null; statement: CompiledQuery<any> | null };

/**
 * An address with no data at all leaves the stored uuid alone — a save that did
 * not touch the address must not clear the tracker's reference to it.
 */
function planAddress(
  address: AddressData | null,
  storedUuid: string | null,
  newId: () => string,
): PlannedAddress {
  if (!address) return { uuid: storedUuid, statement: null };

  if (storedUuid) {
    return {
      uuid: storedUuid,
      statement: db
        .updateTable("Addresses")
        .set(addressColumns(address))
        .where("id", "=", storedUuid)
        .compile(),
    };
  }

  const id = newId();
  return {
    uuid: id,
    statement: db
      .insertInto("Addresses")
      .values({ id, ...addressColumns(address) })
      .compile(),
  };
}

export function planWorkTrackerSave(input: WorkTrackerSaveInput): WorkTrackerSavePlan {
  const { workTracker, effectiveStatus, newId } = input;

  const pickup = planAddress(input.pickUpAddress, workTracker.pickup_address_uuid, newId);
  const dropoff = planAddress(input.dropOffAddress, workTracker.dropoff_address_uuid, newId);

  const statements: CompiledQuery<any>[] = [];
  if (pickup.statement) statements.push(pickup.statement);
  if (dropoff.statement) statements.push(dropoff.statement);

  const fields = {
    date: workTracker.date,
    pickup_address_uuid: pickup.uuid,
    pickup_poc: workTracker.pickup_poc,
    pickup_poc_contact_uuid: workTracker.pickup_poc_contact_uuid,
    // pickup_time/dropoff_time (legacy free-text columns, kept only for the
    // driver app) are no longer written from the web app — they're kept in
    // sync from pickup_time_mode/start/end by the sync_work_tracker_time_text() DB trigger.
    pickup_time_mode: workTracker.pickup_time_mode,
    pickup_time_start: workTracker.pickup_time_start,
    pickup_time_end: workTracker.pickup_time_end,
    pickup_instructions: workTracker.pickup_instructions,
    teardown_required: workTracker.teardown_required ? 1 : 0,
    dropoff_address_uuid: dropoff.uuid,
    dropoff_poc: workTracker.dropoff_poc,
    dropoff_poc_contact_uuid: workTracker.dropoff_poc_contact_uuid,
    dropoff_time_mode: workTracker.dropoff_time_mode,
    dropoff_time_start: workTracker.dropoff_time_start,
    dropoff_time_end: workTracker.dropoff_time_end,
    dropoff_instructions: workTracker.dropoff_instructions,
    setup_required: workTracker.setup_required ? 1 : 0,
    notes: workTracker.notes,
    pay_cents: workTracker.pay_cents,
    bleacher_uuid: workTracker.bleacher_uuid,
    // Both columns always move together: reverting to the assigned bleacher has
    // to clear the reason in the same UPDATE, or the row keeps a reason for a
    // swap that no longer exists.
    ...buildActualBleacherUpdate({
      assignedBleacherUuid: workTracker.bleacher_uuid,
      nextActualBleacherUuid: workTracker.actual_bleacher_uuid,
      nextReason: workTracker.bleacher_change_reason,
    }),
    internal_notes: workTracker.internal_notes,
    driver_uuid: workTracker.driver_uuid,
    status: effectiveStatus,
    work_tracker_type_uuid: workTracker.work_tracker_type_uuid,
    distance_meters: workTracker.distance_meters,
    drive_minutes: workTracker.drive_minutes,
    project_number: workTracker.project_number,
  };

  const wasInsert = workTracker.id === NEW_WORK_TRACKER_ID;
  const workTrackerUuid = wasInsert ? newId() : workTracker.id;

  statements.push(
    wasInsert
      ? db
          .insertInto("WorkTrackers")
          .values({
            id: workTrackerUuid,
            ...fields,
            created_by_user_uuid: input.createdByUserUuid,
          })
          .compile()
      : db.updateTable("WorkTrackers").set(fields).where("id", "=", workTrackerUuid).compile(),
  );

  if (input.notification && input.notificationUserUuid) {
    statements.push(
      buildDriverNotificationInsert(input.notificationUserUuid, input.notification, newId()),
    );
  }

  return {
    statements,
    workTrackerUuid,
    pickupAddressUuid: pickup.uuid,
    dropoffAddressUuid: dropoff.uuid,
    wasInsert,
  };
}

/**
 * The notification insert as a statement rather than a transaction, so a save
 * can carry it in its own batch. `insertDriverNotification` stays the one-shot
 * entry point for the paths that write a notification on its own.
 */
export function buildDriverNotificationInsert(
  userUuid: string,
  preview: DriverNotificationPreview,
  id: string,
): CompiledQuery<any> {
  return db
    .insertInto("Notifications")
    .values({ id, user_id: userUuid, title: preview.title, body: preview.body })
    .compile();
}
