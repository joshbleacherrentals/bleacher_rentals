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

const reads: CompiledQuery[] = [];
let trackerRows: any[] = [];
let addressRows: any[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    reads.push(compiled);
    return Promise.resolve(compiled.sql.includes('from "Addresses"') ? addressRows : trackerRows);
  },
}));

import { readWorkTrackerForModal, toWorkTrackerRow } from "./readWorkTrackerForModal";

// Only the columns this module actually reasons about; the cast keeps the
// fixture readable without weakening `toWorkTrackerRow`'s exact row type.
const localTracker = {
  id: "wt-1",
  date: "2026-09-20",
  pickup_address_uuid: "addr-pickup",
  dropoff_address_uuid: "addr-dropoff",
  setup_required: 1,
  teardown_required: 0,
  pay_cents: 12000,
  status: "released",
} as unknown as Parameters<typeof toWorkTrackerRow>[0];

beforeEach(() => {
  reads.length = 0;
  trackerRows = [localTracker];
  addressRows = [
    { id: "addr-pickup", street: "1 Pickup Rd", city: "Trois-Rivières" },
    { id: "addr-dropoff", street: "2 Dropoff Ave", city: "Québec" },
  ];
});

describe("toWorkTrackerRow", () => {
  it("turns PowerSync's 0/1 columns back into booleans", () => {
    // Local tables store booleans as 0/1; the modal's props are typed boolean,
    // and `0` is falsy but `!== false`, which is the kind of thing that only
    // shows up as a checkbox that will not tick.
    const row = toWorkTrackerRow(localTracker);

    expect(row.setup_required).toBe(true);
    expect(row.teardown_required).toBe(false);
  });

  it("leaves other columns untouched", () => {
    const row = toWorkTrackerRow(localTracker);

    expect(row.pay_cents).toBe(12000);
    expect(row.status).toBe("released");
  });
});

describe("readWorkTrackerForModal", () => {
  it("resolves both addresses without going to the network", async () => {
    const result = await readWorkTrackerForModal("wt-1");

    expect(result.workTracker?.id).toBe("wt-1");
    expect(result.pickupAddress?.street).toBe("1 Pickup Rd");
    expect(result.dropoffAddress?.street).toBe("2 Dropoff Ave");
  });

  it("reads the tracker and both addresses in two local queries", async () => {
    await readWorkTrackerForModal("wt-1");

    // Was three sequential Supabase round-trips for data already held locally.
    expect(reads).toHaveLength(2);
  });

  it("skips the address query when the tracker has no addresses", async () => {
    trackerRows = [{ ...localTracker, pickup_address_uuid: null, dropoff_address_uuid: null }];

    const result = await readWorkTrackerForModal("wt-1");

    expect(reads).toHaveLength(1);
    expect(result.pickupAddress).toBeNull();
    expect(result.dropoffAddress).toBeNull();
  });

  it("returns nulls when the tracker is not in the local DB yet", async () => {
    trackerRows = [];

    const result = await readWorkTrackerForModal("wt-missing");

    expect(result.workTracker).toBeNull();
    expect(result.pickupAddress).toBeNull();
  });
});
