import { describe, expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import { buildUserAlertsQueries, mergeUserAlerts } from "./userAlertsData";

// Spec: docs/specs/slow-local-db-step1-split-watchers.md §7 (D6).
//
// The old single JOIN query and the new five small queries plus the JS merge run against the
// same random data in an in-memory SQLite, and must return the same rows. Row order is compared
// only through the two sort keys, because rows that tie on both are in no defined order.

// The old query, verbatim from `useUserAlerts` before this step (compiled by Kysely).
// Parameters: the three entity types, then the user's id.
const OLD_SQL = `select coalesce("ev"."event_end", "bev"."event_end", "wt"."date") as "entityDate", coalesce("ev"."event_start", "bev"."event_start", "wt"."date") as "entityStartDate", "ua"."id" as "userAlertId", "a"."id" as "alertId", "a"."entity_uuid" as "entityUuid", "a"."entity_type" as "entityType", "a"."entity_description" as "entityDescription", "a"."title" as "title", "a"."message" as "message", "ua"."dismissed" as "dismissed", "ua"."dismissed_until" as "dismissedUntil", "ua"."created_at" as "createdAt" from "UserAlerts" as "ua" inner join "Alerts" as "a" on "a"."id" = "ua"."alert_uuid" left join "Events" as "ev" on "ev"."id" = "a"."entity_uuid" and "a"."entity_type" = ? left join "BleacherEvents" as "be" on "be"."id" = "a"."entity_uuid" and "a"."entity_type" = ? left join "Events" as "bev" on "bev"."id" = "be"."event_uuid" left join "WorkTrackers" as "wt" on "wt"."id" = "a"."entity_uuid" and "a"."entity_type" = ? where "ua"."user_uuid" = ? order by "ua"."dismissed_until" asc, "ua"."created_at" desc`;

const FIELDS = [
  "userAlertId",
  "alertId",
  "entityUuid",
  "entityType",
  "entityDescription",
  "title",
  "message",
  "dismissed",
  "dismissedUntil",
  "createdAt",
  "entityDate",
  "entityStartDate",
] as const;

type Row = Record<(typeof FIELDS)[number], unknown>;

const compileOnlyDb = new Kysely<PowerSyncDB>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = ["u1", "u2", "u3"];
const DATES = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", ""];
const REMINDERS = [null, null, "2026-01-05", "2026-01-09", "2026-02-01"];
const CREATED = ["2026-01-01", "2026-01-02", "2026-01-03", null];

function seed(db: DatabaseSync, rand: () => number): void {
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const chance = (p: number) => rand() < p;
  const orNull = <T>(value: T, p = 0.2): T | null => (chance(p) ? null : value);

  db.exec(`
    create table "UserAlerts" (id text primary key, user_uuid text, alert_uuid text,
      dismissed integer, dismissed_until text, created_at text);
    create table "Alerts" (id text primary key, entity_uuid text, entity_type text,
      title text, message text, entity_description text);
    create table "BleacherEvents" (id text primary key, event_uuid text);
    create table "Events" (id text primary key, event_start text, event_end text);
    create table "WorkTrackers" (id text primary key, date text);
  `);

  const insert = (sql: string, values: SQLInputValue[]) => db.prepare(sql).run(...values);

  const eventIds = Array.from({ length: 6 }, (_, i) => `ev${i}`);
  const bleacherEventIds = Array.from({ length: 6 }, (_, i) => `be${i}`);
  const workTrackerIds = Array.from({ length: 4 }, (_, i) => `wt${i}`);

  for (const id of eventIds) {
    insert(`insert into "Events" values (?, ?, ?)`, [id, orNull(pick(DATES)), orNull(pick(DATES))]);
  }
  for (const id of bleacherEventIds) {
    insert(`insert into "BleacherEvents" values (?, ?)`, [
      id,
      orNull(pick([...eventIds, "ev-missing"])),
    ]);
  }
  for (const id of workTrackerIds) {
    insert(`insert into "WorkTrackers" values (?, ?)`, [id, orNull(pick(DATES))]);
  }

  const entityTypes = ["event", "bleacher_event", "work_tracker", "other"];
  const entityIds = [...eventIds, ...bleacherEventIds, ...workTrackerIds, "x-missing"];
  const alertIds = Array.from({ length: 14 }, (_, i) => `a${i}`);
  for (const id of alertIds) {
    insert(`insert into "Alerts" values (?, ?, ?, ?, ?, ?)`, [
      id,
      orNull(pick(entityIds), 0.1),
      orNull(pick(entityTypes), 0.1),
      orNull(`title ${id}`),
      orNull(`message ${id}`),
      orNull(`description ${id}`),
    ]);
  }

  for (let i = 0; i < 24; i++) {
    insert(`insert into "UserAlerts" values (?, ?, ?, ?, ?, ?)`, [
      `ua${i}`,
      pick(USERS),
      orNull(pick([...alertIds, "a-missing"]), 0.1),
      pick([0, 1, null]),
      pick(REMINDERS),
      pick(CREATED),
    ]);
  }
}

const asRows = (rows: unknown[]): Row[] => rows.map((r) => ({ ...(r as object) }) as Row);
const keysOf = (rows: Row[]) => rows.map((r) => [r.dismissedUntil, r.createdAt]);
const canonical = (rows: Row[]) => rows.map((r) => JSON.stringify(FIELDS.map((f) => r[f]))).sort();

describe("useUserAlerts: old JOIN query against the new small queries", () => {
  it("returns the same rows for 200 random datasets and every user", () => {
    let compared = 0;
    let withDate = 0;
    let withoutDate = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      const db = new DatabaseSync(":memory:");
      seed(db, mulberry32(dataset));

      for (const user of USERS) {
        const oldRows = asRows(
          db.prepare(OLD_SQL).all("event", "bleacher_event", "work_tracker", user),
        );

        const queries = buildUserAlertsQueries(compileOnlyDb, user);
        const run = (compiled: { sql: string; parameters: readonly unknown[] }) =>
          db.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[]));
        const newRows = mergeUserAlerts({
          userAlerts: run(queries.userAlerts),
          alerts: run(queries.alerts),
          bleacherEvents: run(queries.bleacherEvents),
          events: run(queries.events),
          workTrackers: run(queries.workTrackers),
        } as never) as unknown as Row[];

        expect(keysOf(newRows), `order, dataset ${dataset}, ${user}`).toEqual(keysOf(oldRows));
        expect(canonical(newRows), `rows, dataset ${dataset}, ${user}`).toEqual(canonical(oldRows));

        compared += oldRows.length;
        for (const row of oldRows) {
          if (row.entityDate === null) withoutDate++;
          else withDate++;
        }
      }
      db.close();
    }

    // Guard against a vacuous pass: the datasets must exercise rows with and without dates.
    expect(compared).toBeGreaterThan(1000);
    expect(withDate).toBeGreaterThan(100);
    expect(withoutDate).toBeGreaterThan(100);
  });
});
