import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

import { planWorkTrackerSave, type WorkTrackerSaveInput } from "./planWorkTrackerSave";

let nextId = 0;
const newId = () => `generated-${++nextId}`;

beforeEach(() => {
  nextId = 0;
});

const tracker = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "wt-1",
    date: "2026-03-01",
    pickup_address_uuid: null,
    pickup_poc: null,
    pickup_poc_contact_uuid: null,
    pickup_time_mode: null,
    pickup_time_start: null,
    pickup_time_end: null,
    pickup_instructions: null,
    teardown_required: false,
    dropoff_address_uuid: null,
    dropoff_poc: null,
    dropoff_poc_contact_uuid: null,
    dropoff_time_mode: null,
    dropoff_time_start: null,
    dropoff_time_end: null,
    dropoff_instructions: null,
    setup_required: true,
    notes: null,
    pay_cents: 1000,
    bleacher_uuid: "b-1",
    actual_bleacher_uuid: null,
    bleacher_change_reason: null,
    internal_notes: null,
    driver_uuid: "d-1",
    status: "released",
    work_tracker_type_uuid: "t-1",
    distance_meters: null,
    drive_minutes: null,
    project_number: null,
    created_by_user_uuid: null,
    ...overrides,
  }) as unknown as WorkTrackerSaveInput["workTracker"];

const input = (overrides: Partial<WorkTrackerSaveInput> = {}): WorkTrackerSaveInput => ({
  workTracker: tracker(),
  pickUpAddress: null,
  dropOffAddress: null,
  effectiveStatus: "released",
  createdByUserUuid: null,
  notification: null,
  notificationUserUuid: null,
  newId,
  ...overrides,
});

const address = (overrides: Record<string, unknown> = {}) => ({
  addressUuid: null,
  address: "1 Main St",
  city: "Springfield",
  state: "IL",
  postalCode: "62701",
  ...overrides,
});

describe("planWorkTrackerSave", () => {
  it("plans an update as a single statement when nothing else changed", () => {
    const plan = planWorkTrackerSave(input());

    expect(plan.statements).toHaveLength(1);
    expect(plan.wasInsert).toBe(false);
    expect(plan.workTrackerUuid).toBe("wt-1");
    expect(plan.statements[0].sql).toContain('update "WorkTrackers"');
  });

  it("clears the Auto Work Trackers key, so the model's bulk delete keeps an edited tracker", () => {
    const stmt = planWorkTrackerSave(input()).statements[0];

    expect(stmt.sql).toContain('"auto_work_tracker_id" = ?');
    const sets = stmt.sql.match(/set (.*) where/)![1].split(", ");
    const at = sets.findIndex((s) => s.startsWith('"auto_work_tracker_id"'));
    expect(stmt.parameters[at]).toBeNull();
  });

  it("generates the work tracker id up front for an insert", () => {
    const plan = planWorkTrackerSave(input({ workTracker: tracker({ id: "-1" }) }));

    expect(plan.wasInsert).toBe(true);
    expect(plan.workTrackerUuid).toBe("generated-1");
    expect(plan.statements[0].sql).toContain('insert into "WorkTrackers"');
    expect(plan.statements[0].parameters).toContain("generated-1");
  });

  it("writes both addresses before the tracker row that references them", () => {
    const plan = planWorkTrackerSave(
      input({ pickUpAddress: address(), dropOffAddress: address({ address: "2 Oak Ave" }) }),
    );

    expect(plan.statements.map((s) => s.sql.slice(0, 24))).toEqual([
      'insert into "Addresses" ',
      'insert into "Addresses" ',
      'update "WorkTrackers" se',
    ]);
  });

  it("puts the generated address ids on the tracker row", () => {
    const plan = planWorkTrackerSave(
      input({ pickUpAddress: address(), dropOffAddress: address({ address: "2 Oak Ave" }) }),
    );

    expect(plan.pickupAddressUuid).toBe("generated-1");
    expect(plan.dropoffAddressUuid).toBe("generated-2");
    expect(plan.statements[2].parameters).toContain("generated-1");
    expect(plan.statements[2].parameters).toContain("generated-2");
  });

  it("updates an existing address in place rather than creating a second row", () => {
    const plan = planWorkTrackerSave(
      input({
        workTracker: tracker({ pickup_address_uuid: "addr-9" }),
        pickUpAddress: address({ addressUuid: "addr-9" }),
      }),
    );

    expect(plan.pickupAddressUuid).toBe("addr-9");
    expect(plan.statements[0].sql).toContain('update "Addresses"');
    expect(plan.statements[0].parameters).toContain("addr-9");
  });

  it("gives the tracker its own new row instead of editing an address something else uses", () => {
    // e.g. the auto planner put the event's own address on the tracker: editing it in place
    // would move the event, its venue and every event at that venue.
    const plan = planWorkTrackerSave(
      input({
        workTracker: tracker({ pickup_address_uuid: "event-addr" }),
        pickUpAddress: address({ addressUuid: "event-addr", lat: 43.1, lng: -80.2 }),
        sharedAddressUuids: new Set(["event-addr"]),
      }),
    );

    expect(plan.pickupAddressUuid).toBe("generated-1");
    expect(plan.statements.some((s) => s.sql.includes('update "Addresses"'))).toBe(false);
    expect(plan.statements[0].sql).toContain('insert into "Addresses"');
    expect(plan.statements[0].parameters).toContain(43.1);
    expect(plan.statements.flatMap((s) => s.parameters)).not.toContain("event-addr");
  });

  it("does not edit a row the tracker's pickup and drop-off share with each other", () => {
    const plan = planWorkTrackerSave(
      input({
        workTracker: tracker({ pickup_address_uuid: "same", dropoff_address_uuid: "same" }),
        pickUpAddress: address({ addressUuid: "same", address: "2 New Rd" }),
      }),
    );

    expect(plan.pickupAddressUuid).not.toBe("same");
    expect(plan.dropoffAddressUuid).toBe("same");
    expect(plan.statements.some((s) => s.sql.includes('update "Addresses"'))).toBe(false);
  });

  it("saves the map position, country and place id with the address", () => {
    const plan = planWorkTrackerSave(
      input({
        pickUpAddress: address({ lat: 43.1, lng: -80.2, country: "CA", placeId: "ChIJx" }),
      }),
    );

    expect(plan.statements[0].parameters).toEqual(
      expect.arrayContaining([43.1, -80.2, "CA", "ChIJx"]),
    );
  });

  it("keeps the stored address uuid when no address was supplied", () => {
    const plan = planWorkTrackerSave(
      input({ workTracker: tracker({ pickup_address_uuid: "addr-9" }), pickUpAddress: null }),
    );

    expect(plan.pickupAddressUuid).toBe("addr-9");
    expect(plan.statements).toHaveLength(1);
  });

  it("appends the driver notification to the same batch", () => {
    const plan = planWorkTrackerSave(
      input({
        notification: { title: "You Received a New Trip!", body: "New trip" },
        notificationUserUuid: "user-7",
      }),
    );

    expect(plan.statements).toHaveLength(2);
    expect(plan.statements[1].sql).toContain('insert into "Notifications"');
    expect(plan.statements[1].parameters).toContain("user-7");
    expect(plan.statements[1].parameters).toContain("You Received a New Trip!");
  });

  it("omits the notification when there is no driver user to send it to", () => {
    const plan = planWorkTrackerSave(
      input({ notification: { title: "t", body: "b" }, notificationUserUuid: null }),
    );

    expect(plan.statements).toHaveLength(1);
  });

  it("commits the whole save as one transaction even at its largest", () => {
    const plan = planWorkTrackerSave(
      input({
        workTracker: tracker({ id: "-1" }),
        pickUpAddress: address(),
        dropOffAddress: address(),
        notification: { title: "t", body: "b" },
        notificationUserUuid: "user-7",
      }),
    );

    // Two addresses, the tracker and the notification: four statements that used
    // to be four transactions.
    expect(plan.statements).toHaveLength(4);
  });

  it("writes the resolved status rather than the one on the draft row", () => {
    const plan = planWorkTrackerSave(
      input({ workTracker: tracker({ status: "draft" }), effectiveStatus: "accepted" }),
    );

    expect(plan.statements[0].parameters).toContain("accepted");
    expect(plan.statements[0].parameters).not.toContain("draft");
  });

  it("stamps the creating user on an insert", () => {
    const plan = planWorkTrackerSave(
      input({ workTracker: tracker({ id: "-1" }), createdByUserUuid: "user-3" }),
    );

    expect(plan.statements[0].parameters).toContain("user-3");
  });

  it("clears a stale swap reason when the actual bleacher matches the assigned one", () => {
    const plan = planWorkTrackerSave(
      input({
        workTracker: tracker({
          actual_bleacher_uuid: "b-1",
          bleacher_change_reason: "damaged",
        }),
      }),
    );

    expect(plan.statements[0].parameters).not.toContain("damaged");
  });

  it("stores booleans as the 0/1 the local tables use", () => {
    const plan = planWorkTrackerSave(
      input({ workTracker: tracker({ setup_required: true, teardown_required: false }) }),
    );

    expect(plan.statements[0].parameters).toContain(1);
    expect(plan.statements[0].parameters).toContain(0);
  });
});
