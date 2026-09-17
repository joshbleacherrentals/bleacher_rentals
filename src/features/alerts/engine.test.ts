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

let existingAlerts: Array<{
  id: string;
  message: string | null;
  entity_description: string | null;
}> = [];
const batches: CompiledQuery[][] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: () => Promise.resolve(existingAlerts),
  typedExecute: () => Promise.resolve(),
  typedExecuteBatch: (statements: CompiledQuery[]) => {
    batches.push(statements);
    return Promise.resolve();
  },
}));

import { planAlertsForEntity, syncAlertsForEntity } from "./engine";

const alert = {
  entity_uuid: "be-1",
  entity_type: "bleacher_event" as const,
  title: "No Transportation",
  message: "Bleacher 12 has no transportation booked",
  entity_description: "Spring Meet · 2026-09-20",
};

beforeEach(() => {
  existingAlerts = [];
  batches.length = 0;
});

describe("planAlertsForEntity", () => {
  it("writes an alert and its recipients in foreign-key-safe order", async () => {
    const statements = await planAlertsForEntity(
      alert.title,
      "be-1",
      "bleacher_event",
      [alert],
      ["user-1", "user-2"],
    );

    // The Alerts row has to exist before the UserAlerts rows that point at it,
    // since the whole plan now commits as one transaction.
    const tables = statements.map((s) => s.sql.match(/insert into "(\w+)"/)![1]);
    expect(tables).toEqual(["Alerts", "UserAlerts", "UserAlerts"]);
  });

  it("clears a stale alert before inserting the replacement", async () => {
    existingAlerts = [
      { id: "alert-old", message: "a message that no longer applies", entity_description: "old" },
    ];

    const statements = await planAlertsForEntity(
      alert.title,
      "be-1",
      "bleacher_event",
      [alert],
      ["user-1"],
    );

    const kinds = statements.map((s) =>
      s.sql.startsWith("delete") ? "delete" : s.sql.startsWith("update") ? "update" : "insert",
    );
    expect(kinds).toEqual(["delete", "delete", "insert", "insert"]);
  });

  it("plans nothing when the alert is already stored unchanged", async () => {
    existingAlerts = [
      { id: "alert-1", message: alert.message, entity_description: alert.entity_description },
    ];

    const statements = await planAlertsForEntity(
      alert.title,
      "be-1",
      "bleacher_event",
      [alert],
      ["user-1"],
    );

    expect(statements).toEqual([]);
  });
});

describe("syncAlertsForEntity", () => {
  it("still applies its plan itself, in one batch, for callers that execute directly", async () => {
    await syncAlertsForEntity(alert.title, "be-1", "bleacher_event", [alert], ["user-1"]);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
