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
