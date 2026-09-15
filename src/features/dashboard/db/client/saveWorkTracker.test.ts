import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// Built lazily: `db.ts` now reaches PowerSync hooks that compile their queries at
// module scope, and those run while `vi.mock`'s factory is still hoisted above
// any `const` in this file.
// `var`, not `let`: the hoisted mock factory runs before any `let` leaves its
// temporal dead zone.
// eslint-disable-next-line no-var
var testDbInstance: Kysely<any> | undefined;
function testDb(): Kysely<any> {
  testDbInstance ??= new Kysely<any>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });
  return testDbInstance;
}

const singleExecutes: CompiledQuery[] = [];
const batches: CompiledQuery[][] = [];
let driverUserRows: { user_uuid: string | null }[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb();
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) =>
    Promise.resolve(compiled.sql.includes('"Drivers"') ? driverUserRows : []),
  typedExecute: (compiled: CompiledQuery) => {
    singleExecutes.push(compiled);
    return Promise.resolve();
  },
  typedExecuteBatch: (statements: CompiledQuery[]) => {
    batches.push(statements);
    return Promise.resolve();
  },
}));

vi.mock("@/app/actions/db.actions", () => ({ updateDataBase: vi.fn() }));
vi.mock("@/features/alerts/scheduleTriage", () => ({ scheduleTriage: vi.fn() }));
vi.mock("@/components/toasts/SuccessToast", () => ({
  createSuccessToast: vi.fn(),
  SuccessToast: () => null,
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToast: vi.fn(),
  ErrorToast: () => null,
}));

import { saveWorkTracker } from "./db";

const tracker = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "wt-1",
    date: "2026-03-01",
    pickup_address_uuid: null,
    dropoff_address_uuid: null,
    teardown_required: false,
    setup_required: true,
    pay_cents: 1000,
    bleacher_uuid: "b-1",
    actual_bleacher_uuid: null,
    bleacher_change_reason: null,
    driver_uuid: "d-1",
    status: "released",
    work_tracker_type_uuid: "t-1",
    created_by_user_uuid: "user-1",
    ...overrides,
  }) as any;

const address = (street: string) => ({ addressUuid: null, address: street, city: "Springfield" });

beforeEach(() => {
  singleExecutes.length = 0;
  batches.length = 0;
  driverUserRows = [{ user_uuid: "driver-user-1" }];
});

describe("saveWorkTracker", () => {
  it("commits every write in one transaction, whatever the save contains", async () => {
    await saveWorkTracker(tracker({ id: "-1" }), address("1 Main St"), address("2 Oak Ave"), {
      previousStatus: "draft",
      changeType: "notify-only",
    });

    expect(batches).toHaveLength(1);
    expect(singleExecutes).toHaveLength(0);

    // Two addresses, the tracker insert and the driver notification.
    expect(batches[0]).toHaveLength(4);
  });

  it("writes the addresses before the tracker row that references them", async () => {
    await saveWorkTracker(tracker(), address("1 Main St"), address("2 Oak Ave"));

    const kinds = batches[0].map((statement) => statement.sql.split(" ").slice(0, 3).join(" "));
    expect(kinds.slice(0, 2)).toEqual(['insert into "Addresses"', 'insert into "Addresses"']);
    expect(kinds[2]).toBe('update "WorkTrackers" set');
  });

  it("returns the id it generated for a new tracker", async () => {
    const id = await saveWorkTracker(tracker({ id: "-1" }), null, null);

    expect(id).not.toBe("-1");
    expect(batches[0][0].parameters).toContain(id);
  });

  it("still commits once when the driver has no linked user to notify", async () => {
    driverUserRows = [];

    await saveWorkTracker(tracker(), null, null);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });
});
