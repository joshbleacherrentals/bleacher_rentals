import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

/** Rows handed back per table, keyed by the table the query selects from. */
let rowsByTable: Record<string, unknown[]> = {};

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    const table = Object.keys(rowsByTable).find((t) => compiled.sql.includes(`from "${t}"`));
    return Promise.resolve(table ? rowsByTable[table] : []);
  },
}));

import { loadEventForModal } from "./loadEventForModal";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";

const EVENT_ROW = {
  id: "ev-1",
  event_name: "County Fair",
  event_start: "2026-10-01",
  event_end: "2026-10-03",
  setup_start: null,
  teardown_end: null,
  total_seats: 300,
  seven_row: null,
  ten_row: 2,
  fifteen_row: null,
  lenient: 0,
  event_status: "booked",
  lost_reason: null,
  lost_reason_note: null,
  contract_revenue_cents: null,
  notes: null,
  must_be_clean: 0,
  hsl_hue: 120,
  goodshuffle_url: null,
  booked_at: null,
  created_at: "2026-08-01T14:30:00Z",
  created_by_user_uuid: "user-1",
  address_id: "addr-1",
  address_street: "1 Fairground Rd",
  address_city: "Guelph",
  address_state: "ON",
  address_postal: "N1H 1A1",
  venue_uuid: "venue-1",
  venue_name: "Guelph Fairgrounds",
};

beforeEach(() => {
  useCurrentEventStore.getState().resetForm();
  useMaintenanceEventStore.getState().resetForm();
  rowsByTable = {
    Events: [EVENT_ROW],
    BleacherEvents: [{ bleacher_uuid: "b-1" }],
    EventLineItems: [],
  };
});

describe("loadEventForModal — opening an event on the dashboard", () => {
  it("prepopulates the venue", async () => {
    await loadEventForModal("ev-1", "dashboard");

    const s = useCurrentEventStore.getState();
    expect(s.venueUuid).toBe("venue-1");
    expect(s.venueName).toBe("Guelph Fairgrounds");
    expect(s.addressData?.address).toBe("1 Fairground Rd");
  });

  it("prepopulates the created date", async () => {
    await loadEventForModal("ev-1", "dashboard");

    expect(useCurrentEventStore.getState().createdAt).toBe("2026-08-01T14:30:00Z");
  });

  it("clears the previous event's venue when the new one has none", async () => {
    useCurrentEventStore.getState().setField("venueUuid", "old-venue");
    useCurrentEventStore.getState().setField("venueName", "Old Venue");
    rowsByTable.Events = [{ ...EVENT_ROW, venue_uuid: null, venue_name: null }];

    await loadEventForModal("ev-1", "dashboard");

    const s = useCurrentEventStore.getState();
    expect(s.venueUuid).toBeNull();
    expect(s.venueName).toBe("");
  });

  it("expands the dashboard form and closes an open maintenance form", async () => {
    useMaintenanceEventStore.getState().setField("isFormExpanded", true);

    await loadEventForModal("ev-1", "dashboard");

    expect(useCurrentEventStore.getState().isFormExpanded).toBe(true);
    expect(useCurrentEventStore.getState().isModalOpen).toBe(false);
    expect(useMaintenanceEventStore.getState().isFormExpanded).toBe(false);
  });
});
