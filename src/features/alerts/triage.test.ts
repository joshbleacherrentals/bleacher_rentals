import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const batches: CompiledQuery[][] = [];
let currentBleacherUuid = "bleacher-1";

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    reads.push(compiled);
    if (compiled.sql.includes('from "WorkTrackers"')) {
      return Promise.resolve([
        { id: "wt-1", bleacher_uuid: currentBleacherUuid, date: "2026-09-16" },
      ]);
    }
    if (compiled.sql.includes('from "BleacherEvents"')) {
      return Promise.resolve([{ id: "be-1" }]);
    }
    return Promise.resolve([]);
  },
  typedExecute: () => Promise.resolve(),
  typedExecuteBatch: (statements: CompiledQuery[]) => {
    batches.push(statements);
    return Promise.resolve();
  },
}));

vi.mock("./engine", () => ({
  syncAlert: () => Promise.resolve(),
  planAlert: (definition: { title: string }, entityUuid: string) =>
    Promise.resolve([{ sql: `plan ${definition.title} ${entityUuid}`, parameters: [], query: {} }]),
  deleteAllAlertsForEntity: () => Promise.resolve(),
}));

vi.mock("./registry", () => ({
  getDefinitionsForEntity: (entityType: string) =>
    entityType === "bleacher_event"
      ? [{ title: "No Transportation" }, { title: "Scheduling Conflict" }]
      : [],
}));

import { triage } from "./triage";
import { resetCascadeQueue } from "./cascadeQueue";
import { getUpcomingWindowEnd } from "./util/getUpcomingWindow";
import { businessToday } from "./util/pastAlerts";

const TUESDAY_NOON = new Date("2026-09-15T16:00:00Z"); // Tuesday, noon in Toronto

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TUESDAY_NOON);
  reads.length = 0;
  batches.length = 0;
  resetCascadeQueue();
  currentBleacherUuid = "bleacher-1";
});

afterEach(() => {
  vi.useRealTimers();
});

function rippleQuery(): CompiledQuery {
  const query = reads.find((r) => r.sql.includes('from "BleacherEvents"'));
  if (!query) throw new Error("triage never ran the ripple query");
  return query;
}

describe("triage WorkTrackers", () => {
  it("bounds the ripple to the upcoming alert window", async () => {
    await triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: null });

    // Without an upper bound the cascade re-evaluates events a year out, for
    // which no alert can ever fire — the multiplier behind a 14s save.
    // Both bounds are plain dates: the columns they filter are DATE columns, and an instant as
    // the lower bound sorted after every row dated today.
    expect(rippleQuery().parameters).toContain(getUpcomingWindowEnd());
    expect(rippleQuery().parameters).toContain(businessToday());
    expect(rippleQuery().parameters).toContain("2026-09-15");
  });

  it("still evaluates every bleacher_event definition inside the window", async () => {
    await triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: null });

    // Guards the obvious way to make the bound "fast": evaluate nothing.
    const planned = batches.flat().map((s) => s.sql);
    expect(planned).toContain("plan No Transportation be-1");
    expect(planned).toContain("plan Scheduling Conflict be-1");
  });

  it("collapses a burst of saves for one tracker into two cascades", async () => {
    // Eight rapid drags of the same tracker used to start eight cascades that
    // contended for the single wa-sqlite worker.
    await Promise.all(
      Array.from({ length: 8 }, () =>
        triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: null }),
      ),
    );

    const rippleQueries = reads.filter((r) => r.sql.includes('from "BleacherEvents"'));
    expect(rippleQueries).toHaveLength(2);
  });

  it("does not collapse cascades for different trackers", async () => {
    await Promise.all([
      triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: null }),
      triage("WorkTrackers", { id: "wt-2", previous_bleacher_uuid: null }),
    ]);

    const rippleQueries = reads.filter((r) => r.sql.includes('from "BleacherEvents"'));
    expect(rippleQueries).toHaveLength(2);
  });

  it("re-evaluates every bleacher a collapsed burst passed through", async () => {
    // Drag A → B → C faster than one cascade completes. Collapsing must not lose
    // B: the events on the bleacher the tracker passed through still need their
    // transportation alerts re-derived.
    currentBleacherUuid = "bleacher-C";

    await Promise.all([
      triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: "bleacher-A" }),
      triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: "bleacher-B" }),
    ]);

    const rippled = new Set(
      reads
        .filter((r) => r.sql.includes('from "BleacherEvents"'))
        .flatMap((r) => r.parameters as unknown[]),
    );

    expect(rippled).toContain("bleacher-A");
    expect(rippled).toContain("bleacher-B");
    expect(rippled).toContain("bleacher-C");
  });

  it("commits the whole cascade as one transaction", async () => {
    await triage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: null });

    // ~100 separate transactions used to cost 20-100ms of IndexedDB each and
    // woke every watched query on the touched tables every single time.
    expect(batches).toHaveLength(1);
    expect(batches[0].map((s) => s.sql)).toEqual([
      "plan No Transportation be-1",
      "plan Scheduling Conflict be-1",
    ]);
  });
});
