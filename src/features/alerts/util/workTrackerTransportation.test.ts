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
 * A real SQLite database, so the compiled queries actually run. Asserting on SQL
 * strings would not prove the thing that matters here: that fetching one
 * candidate row returns what fetching the whole history returned.
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

import {
  getExpectedAddressFullForWorkTracker,
  getExpectedPickupStreetForWorkTracker,
} from "./workTrackerTransportation";

const BLEACHER = "bleacher-1";

function setupSchema() {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE Addresses (
      id TEXT PRIMARY KEY, street TEXT, city TEXT, state_province TEXT, zip_postal TEXT
    );
    CREATE TABLE Events (
      id TEXT PRIMARY KEY, event_start TEXT, event_end TEXT, event_status TEXT,
      deleted INTEGER, address_uuid TEXT, event_name TEXT,
      setup_start TEXT, teardown_end TEXT, created_by_user_uuid TEXT
    );
    CREATE TABLE BleacherEvents (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, event_uuid TEXT
    );
    CREATE TABLE WorkTrackers (
      id TEXT PRIMARY KEY, bleacher_uuid TEXT, date TEXT,
      dropoff_address_uuid TEXT, pickup_address_uuid TEXT
    );
  `);
}

function addAddress(id: string, street: string) {
  sqlite.prepare(`INSERT INTO Addresses VALUES (?, ?, 'Québec', 'QC', 'G1A 1A1')`).run(id, street);
}

/** An event on the bleacher, at local noon on `date`. */
function addEvent(opts: {
  id: string;
  date: string;
  street: string | null;
  status?: string;
  deleted?: number;
}) {
  const addressId = `addr-${opts.id}`;
  if (opts.street !== null) addAddress(addressId, opts.street);
  const startsAt = new Date(
    Number(opts.date.slice(0, 4)),
    Number(opts.date.slice(5, 7)) - 1,
    Number(opts.date.slice(8, 10)),
    12,
  ).toISOString();
  sqlite
    .prepare(
      `INSERT INTO Events (id, event_start, event_end, event_status, deleted, address_uuid, event_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.id,
      startsAt,
      startsAt,
      opts.status ?? "booked",
      opts.deleted ?? 0,
      opts.street === null ? null : addressId,
      `Event ${opts.id}`,
    );
  sqlite
    .prepare(`INSERT INTO BleacherEvents VALUES (?, ?, ?)`)
    .run(`be-${opts.id}`, BLEACHER, opts.id);
}

function addWorkTracker(opts: {
  id: string;
  date: string;
  dropoffStreet?: string | null;
  pickupStreet?: string | null;
}) {
  let dropoffId: string | null = null;
  let pickupId: string | null = null;
  if (opts.dropoffStreet) {
    dropoffId = `addr-d-${opts.id}`;
    addAddress(dropoffId, opts.dropoffStreet);
  }
  if (opts.pickupStreet) {
    pickupId = `addr-p-${opts.id}`;
    addAddress(pickupId, opts.pickupStreet);
  }
  sqlite
    .prepare(`INSERT INTO WorkTrackers VALUES (?, ?, ?, ?, ?)`)
    .run(opts.id, BLEACHER, opts.date, dropoffId, pickupId);
}

beforeEach(() => {
  setupSchema();
  rowCounts.length = 0;
});

describe("getExpectedPickupStreetForWorkTracker", () => {
  it("fetches one candidate row per source, not the bleacher's whole history", async () => {
    for (let i = 1; i <= 12; i++) {
      addEvent({
        id: `e${i}`,
        date: `2026-0${i < 10 ? i : 9}-0${(i % 9) + 1}`,
        street: `${i} Old St`,
      });
      addWorkTracker({
        id: `w${i}`,
        date: `2026-0${i < 10 ? i : 9}-0${(i % 9) + 1}`,
        dropoffStreet: `${i} Drop Rd`,
      });
    }

    await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    // The scan is the cost: 1.19s on 4 reads for one definition.
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });

  it("returns the most recent booked event at or before the target date", async () => {
    addEvent({ id: "old", date: "2026-08-01", street: "1 Old St" });
    addEvent({ id: "recent", date: "2026-09-10", street: "2 Recent St" });
    addEvent({ id: "future", date: "2026-10-01", street: "3 Future St" });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(street).toBe("2 Recent St");
  });

  it("skips an unbooked nearer event in favour of the older booked one", async () => {
    addEvent({ id: "booked", date: "2026-08-01", street: "1 Booked St" });
    addEvent({ id: "quote", date: "2026-09-10", street: "2 Quote St", status: "quote" });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    // With LIMIT 1 and no status filter in SQL, this would return null.
    expect(street).toBe("1 Booked St");
  });

  it("skips a deleted nearer event", async () => {
    addEvent({ id: "live", date: "2026-08-01", street: "1 Live St" });
    addEvent({ id: "gone", date: "2026-09-10", street: "2 Gone St", deleted: 1 });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(street).toBe("1 Live St");
  });

  it("skips a nearer work tracker whose dropoff address is missing", async () => {
    addWorkTracker({ id: "w-old", date: "2026-08-01", dropoffStreet: "1 Drop Rd" });
    addWorkTracker({ id: "w-empty", date: "2026-09-10", dropoffStreet: null });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(street).toBe("1 Drop Rd");
  });

  it("skips the excluded work tracker", async () => {
    addWorkTracker({ id: "w-old", date: "2026-08-01", dropoffStreet: "1 Drop Rd" });
    addWorkTracker({ id: "w-self", date: "2026-09-10", dropoffStreet: "2 Self Rd" });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      excludeWorkTrackerUuid: "w-self",
    });

    expect(street).toBe("1 Drop Rd");
  });

  it("prefers the event when an event and a work tracker share a date", async () => {
    addEvent({ id: "same", date: "2026-09-10", street: "1 Event St" });
    addWorkTracker({ id: "w-same", date: "2026-09-10", dropoffStreet: "2 Tracker Rd" });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(street).toBe("1 Event St");
  });

  it("includes an event on the target date itself", async () => {
    addEvent({ id: "boundary", date: "2026-09-20", street: "1 Boundary St" });
    addEvent({ id: "earlier", date: "2026-09-01", street: "2 Earlier St" });

    const street = await getExpectedPickupStreetForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
    });

    expect(street).toBe("1 Boundary St");
  });
});

describe("getExpectedAddressFullForWorkTracker", () => {
  it("resolves the last known location looking back", async () => {
    addEvent({ id: "old", date: "2026-08-01", street: "1 Old St" });
    addEvent({ id: "recent", date: "2026-09-10", street: "2 Recent St" });

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(resolved?.street).toBe("2 Recent St");
    expect(resolved?.addressUuid).toBe("addr-recent");
    expect(resolved?.city).toBe("Québec");
  });

  it("resolves the next known location looking forward, target date included", async () => {
    // resolveAddressFull's future direction is inclusive of the target date —
    // unlike resolveAddress, which is strict.
    addEvent({ id: "onTarget", date: "2026-09-20", street: "1 On Target St" });
    addEvent({ id: "later", date: "2026-10-05", street: "2 Later St" });

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "future",
    });

    expect(resolved?.street).toBe("1 On Target St");
  });

  it("uses the work tracker's pickup address when looking forward", async () => {
    addWorkTracker({
      id: "w-next",
      date: "2026-09-25",
      pickupStreet: "1 Pickup Rd",
      dropoffStreet: "2 Dropoff Rd",
    });

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "future",
    });

    expect(resolved?.street).toBe("1 Pickup Rd");
  });

  it("fetches one candidate row per source in both directions", async () => {
    for (let i = 1; i <= 9; i++) {
      addEvent({ id: `e${i}`, date: `2026-0${i}-15`, street: `${i} St` });
      addWorkTracker({
        id: `w${i}`,
        date: `2026-0${i}-16`,
        dropoffStreet: `${i} Rd`,
        pickupStreet: `${i} Pk`,
      });
    }

    rowCounts.length = 0;
    await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-05-20",
      direction: "past",
    });
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);

    rowCounts.length = 0;
    await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-05-20",
      direction: "future",
    });
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(1);
  });

  it("returns null when nothing qualifies", async () => {
    addEvent({ id: "future", date: "2026-12-01", street: "1 Future St" });

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: BLEACHER,
      targetDate: "2026-09-20",
      direction: "past",
    });

    expect(resolved).toBeNull();
  });
});
