import { describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Spec: docs/specs/quote-detail-03-history-panels.md §7 (test 1).
//
// The Contact and Venue history panels used to run `fetchContactEvents` / `fetchVenueEvents`
// once; they now watch the same SQL through `contactEventsQuery` / `venueEventsQuery`. The old
// queries (verbatim, compiled by Kysely) and the new builders run against the same random data in
// an in-memory SQLite and must return the same rows.

vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});

import { contactEventsQuery } from "./fetchContactEvents";
import { venueEventsQuery } from "./fetchVenueEvents";

// The old queries, verbatim from `fetchContactEvents` and `fetchVenueEvents`.
// Parameters: the deleted flag (0), then the contact id twice / the venue id.
const OLD_CONTACT_SQL = `select "id", "event_name", "invoice_number", "event_start", "event_end", "event_status", "contact_uuid", "finance_contact_uuid" from "Events" where "deleted" = ? and ("contact_uuid" = ? or "finance_contact_uuid" = ?)`;
const OLD_VENUE_SQL = `select "id", "event_name", "invoice_number", "event_start", "event_end", "event_status" from "Events" where "deleted" = ? and "venue_uuid" = ?`;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONTACTS = ["c0", "c1", "c2"];
const VENUES = ["v0", "v1"];

function seed(db: DatabaseSync, rand: () => number): void {
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const orNull = <T>(value: T, p = 0.2): T | null => (rand() < p ? null : value);

  db.exec(`create table "Events" (id text primary key, event_name text, invoice_number integer,
    event_start text, event_end text, event_status text, contact_uuid text,
    finance_contact_uuid text, venue_uuid text, deleted integer)`);

  for (let i = 0; i < 18; i++) {
    db.prepare(`insert into "Events" values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `ev${i}`,
      orNull(`Event ${i}`),
      orNull(1000 + i),
      orNull("2026-01-01"),
      orNull(pick(["2020-01-02", "2026-03-01", "2099-01-01"])),
      orNull(pick(["draft", "quoted", "booked", "lost"])),
      orNull(pick(CONTACTS), 0.3),
      orNull(pick(CONTACTS), 0.5),
      orNull(pick(VENUES), 0.3),
      pick([0, 0, 0, 1, null]),
    );
  }
}

const canonical = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).sort();
const run = (db: DatabaseSync, sql: string, parameters: readonly unknown[]) =>
  db.prepare(sql).all(...(parameters as SQLInputValue[]));

describe("history panel queries: the old fetchers against the new builders", () => {
  it("compile to the same SQL and the same parameters", () => {
    const contact = contactEventsQuery("c0");
    expect(contact.sql).toBe(OLD_CONTACT_SQL);
    expect(contact.parameters).toEqual([0, "c0", "c0"]);

    const venue = venueEventsQuery("v0");
    expect(venue.sql).toBe(OLD_VENUE_SQL);
    expect(venue.parameters).toEqual([0, "v0"]);
  });

  it("return the same rows for 200 random datasets, every contact and venue", () => {
    let contactRowsSeen = 0;
    let venueRowsSeen = 0;
    let compared = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      const db = new DatabaseSync(":memory:");
      seed(db, mulberry32(dataset));

      for (const id of [...CONTACTS, "c-missing"]) {
        const expected = run(db, OLD_CONTACT_SQL, [0, id, id]);
        const query = contactEventsQuery(id);
        const actual = run(db, query.sql, query.parameters);
        expect(canonical(actual), `dataset ${dataset}, contact ${id}`).toEqual(canonical(expected));
        contactRowsSeen += expected.length;
        compared++;
      }
      for (const id of [...VENUES, "v-missing"]) {
        const expected = run(db, OLD_VENUE_SQL, [0, id]);
        const query = venueEventsQuery(id);
        const actual = run(db, query.sql, query.parameters);
        expect(canonical(actual), `dataset ${dataset}, venue ${id}`).toEqual(canonical(expected));
        venueRowsSeen += expected.length;
        compared++;
      }
      db.close();
    }

    // A comparison of empty results proves nothing: the data must hold rows to compare.
    expect(compared).toBe(1400);
    expect(contactRowsSeen).toBeGreaterThan(1000);
    expect(venueRowsSeen).toBeGreaterThan(1000);
  });

  it("leave a deleted event out, and match a contact as primary or finance", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`create table "Events" (id text primary key, event_name text, invoice_number integer,
      event_start text, event_end text, event_status text, contact_uuid text,
      finance_contact_uuid text, venue_uuid text, deleted integer)`);
    const insert = db.prepare(
      `insert into "Events" values (?, 'n', 1, null, null, null, ?, ?, ?, ?)`,
    );
    insert.run("primary", "c0", null, "v0", 0);
    insert.run("finance", "other", "c0", "v0", 0);
    insert.run("gone", "c0", null, "v0", 1);
    insert.run("elsewhere", "other", "other", "v1", 0);

    const contact = contactEventsQuery("c0");
    expect(
      run(db, contact.sql, contact.parameters)
        .map((r) => (r as { id: string }).id)
        .sort(),
    ).toEqual(["finance", "primary"]);

    const venue = venueEventsQuery("v0");
    expect(
      run(db, venue.sql, venue.parameters)
        .map((r) => (r as { id: string }).id)
        .sort(),
    ).toEqual(["finance", "primary"]);
  });
});
