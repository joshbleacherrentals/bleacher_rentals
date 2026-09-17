import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
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

/**
 * A real SQLite database, so the compiled queries actually run — same
 * technique as workTrackerTransportation.test.ts. Proves the SQL-side
 * `LIMIT 1` (added to match address's optimization) returns the same
 * candidate `resolvePocContact` would have picked from the bleacher's whole
 * unfiltered history, not just that the query executes.
 */
let sqlite: DatabaseSync;
const rowCounts: number[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: (compiled: CompiledQuery) => {
    const rows = sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[]));
    rowCounts.push(rows.length);
    return Promise.resolve(rows);
  },
}));

import { getExpectedPocForWorkTracker } from "./resolvePocContact";

const BLEACHER = "bleacher-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Contacts (
      id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, deleted INTEGER
    );
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_start TEXT, event_status TEXT,
      deleted INTEGER, contact_uuid TEXT
    );
    CREATE TABLE BleacherEvents (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT
    );
    CREATE TABLE WorkTrackers (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, date TEXT,
      pickup_poc TEXT, pickup_poc_contact_uuid TEXT,
      dropoff_poc TEXT, dropoff_poc_contact_uuid TEXT
    );
  `);
}

function addContact(id: string, firstName: string) {
  sqlite.prepare(`INSERT INTO Contacts VALUES (?, ?, 'Last', 0)`).run(id, firstName);
}

/** A booked event on the bleacher, at local noon on `date`. */
function addEvent(opts: { id: string; date: string; contactFirstName: string | null }) {
  const contactId = opts.contactFirstName === null ? null : `contact-${opts.id}`;
  if (contactId) addContact(contactId, opts.contactFirstName!);
  const startsAt = new Date(
    Number(opts.date.slice(0, 4)),
    Number(opts.date.slice(5, 7)) - 1,
    Number(opts.date.slice(8, 10)),
    12,
  ).toISOString();
  sqlite
    .prepare(
      `INSERT INTO Events (id, event_start, event_status, deleted, contact_uuid) VALUES (?, ?, 'booked', 0, ?)`,
    )
    .run(opts.id, startsAt, contactId);
  sqlite
    .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
    .run(`be-${opts.id}`, BLEACHER, opts.id);
}

function addWorkTracker(opts: {
  id: string;
  date: string;
  dropoffPocText?: string | null;
  dropoffPocContactUuid?: string | null;
  pickupPocText?: string | null;
  pickupPocContactUuid?: string | null;
}) {
  sqlite
    .prepare(`INSERT INTO WorkTrackers VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(
      opts.id,
      BLEACHER,
      opts.date,
      opts.pickupPocText ?? null,
      opts.pickupPocContactUuid ?? null,
      opts.dropoffPocText ?? null,
      opts.dropoffPocContactUuid ?? null,
    );
}

beforeEach(() => {
  setupSchema();
  rowCounts.length = 0;
});

describe("getExpectedPocForWorkTracker", () => {
  it("fetches one candidate row per source, not the bleacher's whole history", async () => {
    for (let i = 1; i <= 12; i++) {
      addEvent({
        id: `e${i}`,
        date: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}`,
        contactFirstName: `C${i}`,
      });
      addWorkTracker({
        id: `w${i}`,
        date: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}`,
        dropoffPocContactUuid: `contact-w${i}`,
      });
    }

    await getExpectedPocForWorkTracker({ bleacherUuid: BLEACHER, targetDate: "2026-09-20" });

    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });

  it("returns the most recent booked contact at or before the target date (past)", async () => {
    addEvent({ id: "old", date: "2026-08-01", contactFirstName: "Old" });
    addEvent({ id: "recent", date: "2026-09-10", contactFirstName: "Recent" });
    addEvent({ id: "future", date: "2026-10-01", contactFirstName: "Future" });

    const result = await getExpectedPocForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({
      kind: "contact",
      contactUuid: "contact-recent",
      displayName: "Recent Last",
      source: "event",
    });
  });

  it("returns the earliest booked contact at or after the target date (future)", async () => {
    addEvent({ id: "past", date: "2026-08-01", contactFirstName: "Past" });
    addEvent({ id: "soon", date: "2026-09-25", contactFirstName: "Soon" });
    addEvent({ id: "later", date: "2026-10-15", contactFirstName: "Later" });

    const result = await getExpectedPocForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "future",
    });

    expect(result).toEqual({
      kind: "contact",
      contactUuid: "contact-soon",
      displayName: "Soon Last",
      source: "event",
    });
  });

  it("a nearer legacy free-text work tracker still wins over a more distant linked contact (D5)", async () => {
    // Distant, linked
    addWorkTracker({ id: "far", date: "2026-08-01", dropoffPocContactUuid: "contact-far" });
    // Nearer, legacy text only — must win the "nearest" contest despite being unlinked.
    addWorkTracker({ id: "near", date: "2026-09-15", dropoffPocText: "Legacy Name" });

    const result = await getExpectedPocForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({ kind: "unlinked", displayName: "Legacy Name", source: "workTracker" });
  });

  it("on an equal date, the event wins over a work tracker", async () => {
    addEvent({ id: "same-day-event", date: "2026-09-20", contactFirstName: "EventWins" });
    addWorkTracker({
      id: "same-day-wt",
      date: "2026-09-20",
      dropoffPocContactUuid: "contact-wt-same-day",
    });

    const result = await getExpectedPocForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(result).toEqual({
      kind: "contact",
      contactUuid: "contact-same-day-event",
      displayName: "EventWins Last",
      source: "event",
    });
  });
});
