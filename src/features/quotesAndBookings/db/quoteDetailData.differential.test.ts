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
import type { QuoteDetail } from "./fetchQuoteDetail";
import { buildQuoteDetailQueries, mergeQuoteDetail } from "./quoteDetailData";

// Spec: docs/specs/quote-detail-01-reactive-quote.md §7 (test 2).
//
// `fetchQuoteDetail` (one query, five JOINs) and the six small queries plus the JS merge run
// against the same random data in an in-memory SQLite, and must return the same `QuoteDetail`,
// including for an event that does not exist.

// The old query, verbatim from `fetchQuoteDetail` (compiled by Kysely). Parameter: the event id.
const OLD_SQL = `select "e"."id" as "id", "e"."invoice_number" as "invoice_number", "e"."event_name" as "event_name", "e"."event_status" as "event_status", "e"."lost_reason" as "lost_reason", "e"."lost_reason_note" as "lost_reason_note", "e"."event_start" as "event_start", "e"."event_end" as "event_end", "e"."setup_start" as "setup_start", "e"."teardown_end" as "teardown_end", "e"."notes" as "notes", "e"."internal_notes" as "internal_notes", "e"."external_notes" as "external_notes", "e"."pickup_instructions" as "pickup_instructions", "e"."dropoff_instructions" as "dropoff_instructions", "e"."contract_revenue_cents" as "contract_revenue_cents", "e"."event_type_uuid" as "event_type_uuid", "e"."quote_valid_till" as "quote_valid_till", "e"."sales_office_uuid" as "sales_office_uuid", "e"."terms_and_conditions_uuid" as "terms_and_conditions_uuid", "e"."tax_percent" as "tax_percent", "e"."tax_amount_cents" as "tax_amount_cents", "e"."is_tax_overridden" as "is_tax_overridden", "e"."booked_at" as "booked_at", "e"."created_at" as "created_at", "e"."created_by_user_uuid" as "created_by_user_uuid", "a"."street" as "address_street", "a"."city" as "address_city", "a"."state_province" as "address_state_province", "a"."zip_postal" as "address_zip_postal", "v"."id" as "venue_id", "v"."name" as "venue_name", "ct"."id" as "contact_id", "ct"."first_name" as "contact_first_name", "ct"."last_name" as "contact_last_name", "ct"."email" as "contact_email", "ct"."phone" as "contact_phone", "fc"."id" as "fc_id", "fc"."first_name" as "fc_first_name", "fc"."last_name" as "fc_last_name", "fc"."email" as "fc_email", "fc"."phone" as "fc_phone", "u"."first_name" as "am_first_name", "u"."last_name" as "am_last_name", "e"."deleted" as "deleted" from "Events" as "e" left join "Addresses" as "a" on "e"."address_uuid" = "a"."id" left join "Venues" as "v" on "e"."venue_uuid" = "v"."id" left join "Contacts" as "ct" on "e"."contact_uuid" = "ct"."id" left join "Contacts" as "fc" on "e"."finance_contact_uuid" = "fc"."id" left join "Users" as "u" on "e"."created_by_user_uuid" = "u"."id" where "e"."id" = ?`;

type Row = Record<string, string | number | null>;

// The old row-to-QuoteDetail mapping, verbatim from `fetchQuoteDetail` (the function is not
// exported, and the edit page keeps using it as it is).
function oldMapping(rows: Row[]): QuoteDetail | null {
  if (rows.length === 0) return null;
  const r = rows[0] as any;
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    eventName: r.event_name,
    eventStatus: r.event_status,
    lostReason: r.lost_reason,
    lostReasonNote: r.lost_reason_note,
    eventStart: r.event_start,
    eventEnd: r.event_end,
    setupStart: r.setup_start,
    teardownEnd: r.teardown_end,
    notes: r.notes,
    internalNotes: r.internal_notes,
    externalNotes: r.external_notes,
    pickupInstructions: r.pickup_instructions,
    dropoffInstructions: r.dropoff_instructions,
    contractRevenueCents: r.contract_revenue_cents,
    eventTypeUuid: r.event_type_uuid,
    quoteValidTill: r.quote_valid_till,
    salesOfficeUuid: r.sales_office_uuid,
    termsAndConditionsUuid: r.terms_and_conditions_uuid,
    taxPercent: r.tax_percent,
    taxAmountCents: r.tax_amount_cents,
    isTaxOverridden: r.is_tax_overridden === 1,
    bookedAt: r.booked_at,
    createdAt: r.created_at,
    createdByUserUuid: r.created_by_user_uuid,
    address: r.address_street
      ? {
          street: r.address_street,
          city: r.address_city ?? "",
          stateProvince: r.address_state_province ?? "",
          zipPostal: r.address_zip_postal,
        }
      : null,
    venue: r.venue_id ? { id: r.venue_id, name: r.venue_name ?? "" } : null,
    contact: r.contact_id
      ? {
          id: r.contact_id,
          firstName: r.contact_first_name ?? "",
          lastName: r.contact_last_name,
          email: r.contact_email,
          phone: r.contact_phone,
        }
      : null,
    financeContact: r.fc_id
      ? {
          id: r.fc_id,
          firstName: r.fc_first_name ?? "",
          lastName: r.fc_last_name,
          email: r.fc_email,
          phone: r.fc_phone,
        }
      : null,
    accountManager:
      r.am_first_name || r.am_last_name
        ? { firstName: r.am_first_name, lastName: r.am_last_name }
        : null,
    deleted: r.deleted === 1,
  };
}

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

const EVENT_IDS = Array.from({ length: 8 }, (_, i) => `ev${i}`);

function seed(db: DatabaseSync, rand: () => number): void {
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const chance = (p: number) => rand() < p;
  const orNull = <T>(value: T, p = 0.2): T | null => (chance(p) ? null : value);

  db.exec(`
    create table "Events" (id text primary key, invoice_number integer, event_name text,
      event_status text, lost_reason text, lost_reason_note text, event_start text, event_end text,
      setup_start text, teardown_end text, notes text, internal_notes text, external_notes text,
      pickup_instructions text, dropoff_instructions text, contract_revenue_cents integer,
      event_type_uuid text, quote_valid_till text, sales_office_uuid text,
      terms_and_conditions_uuid text, tax_percent real, tax_amount_cents integer,
      is_tax_overridden integer, booked_at text, created_at text, created_by_user_uuid text,
      deleted integer, address_uuid text, venue_uuid text, contact_uuid text,
      finance_contact_uuid text);
    create table "Addresses" (id text primary key, street text, city text, state_province text,
      zip_postal text);
    create table "Venues" (id text primary key, name text);
    create table "Contacts" (id text primary key, first_name text, last_name text, email text,
      phone text);
    create table "Users" (id text primary key, first_name text, last_name text);
  `);

  const insert = (sql: string, values: SQLInputValue[]) => db.prepare(sql).run(...values);
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  const addressIds = ids("ad", 4);
  const venueIds = ids("ve", 3);
  const contactIds = ids("co", 4);
  const userIds = ids("us", 3);

  for (const id of addressIds) {
    insert(`insert into "Addresses" values (?, ?, ?, ?, ?)`, [
      id,
      pick(["1 Main St", "", null, "22 Oak Ave"]),
      orNull("Toronto"),
      orNull("ON"),
      orNull("M5V"),
    ]);
  }
  for (const id of venueIds) {
    insert(`insert into "Venues" values (?, ?)`, [id, orNull(`Venue ${id}`)]);
  }
  for (const id of contactIds) {
    insert(`insert into "Contacts" values (?, ?, ?, ?, ?)`, [
      id,
      orNull(`First ${id}`),
      orNull(`Last ${id}`),
      orNull(`${id}@example.com`),
      orNull("555-0100"),
    ]);
  }
  for (const id of userIds) {
    insert(`insert into "Users" values (?, ?, ?)`, [
      id,
      pick([null, "", `First ${id}`]),
      pick([null, "", `Last ${id}`]),
    ]);
  }

  for (const id of EVENT_IDS) {
    // Foreign keys may point at a row that is not synced (the "-missing" ids), or at nothing.
    insert(`insert into "Events" values (${Array(31).fill("?").join(", ")})`, [
      id,
      orNull(1000 + EVENT_IDS.indexOf(id)),
      orNull(`Event ${id}`),
      orNull(pick(["draft", "quoted", "booked", "lost"])),
      orNull(pick(["price", "date"]), 0.6),
      orNull("note", 0.6),
      orNull("2026-05-01"),
      orNull("2026-05-03"),
      orNull("2026-04-30"),
      orNull("2026-05-04"),
      orNull("client note"),
      orNull("internal note"),
      orNull("external note"),
      orNull("pickup"),
      orNull("dropoff"),
      orNull(125000),
      orNull("type-1"),
      orNull("2026-04-15"),
      orNull("office-1"),
      orNull("terms-1"),
      orNull(13.5),
      orNull(14500),
      pick([0, 1, null]),
      orNull("2026-03-02", 0.6),
      "2026-03-01T10:00:00Z",
      orNull(pick([...userIds, "us-missing"]), 0.1),
      pick([0, 0, 1, null]),
      orNull(pick([...addressIds, "ad-missing"]), 0.2),
      orNull(pick([...venueIds, "ve-missing"]), 0.4),
      orNull(pick([...contactIds, "co-missing"]), 0.2),
      orNull(pick([...contactIds, "co-missing"]), 0.4),
    ]);
  }
}

function newQuote(db: DatabaseSync, eventId: string): QuoteDetail | null {
  const queries = buildQuoteDetailQueries(compileOnlyDb, eventId);
  const run = (compiled: { sql: string; parameters: readonly unknown[] }) =>
    db.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[])) as never[];
  return mergeQuoteDetail({
    eventId,
    event: run(queries.event),
    address: run(queries.address),
    venue: run(queries.venue),
    contact: run(queries.contact),
    financeContact: run(queries.financeContact),
    accountManager: run(queries.accountManager),
  });
}

describe("quote detail: old JOIN query against the new small queries", () => {
  it("returns the same QuoteDetail for 200 random datasets and every event, existing or not", () => {
    let compared = 0;
    let found = 0;
    let withAddress = 0;
    let withContact = 0;
    let withFinanceContact = 0;
    let withVenue = 0;
    let withManager = 0;
    let deleted = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      const db = new DatabaseSync(":memory:");
      seed(db, mulberry32(dataset));

      for (const eventId of [...EVENT_IDS, "ev-does-not-exist"]) {
        const oldRows = db.prepare(OLD_SQL).all(eventId) as Row[];
        const expected = oldMapping(oldRows.map((r) => ({ ...r })));
        const actual = newQuote(db, eventId);

        expect(actual, `dataset ${dataset}, event ${eventId}`).toEqual(expected);

        compared++;
        if (expected) {
          found++;
          if (expected.address) withAddress++;
          if (expected.contact) withContact++;
          if (expected.financeContact) withFinanceContact++;
          if (expected.venue) withVenue++;
          if (expected.accountManager) withManager++;
          if (expected.deleted) deleted++;
        }
      }
      db.close();
    }

    // The datasets must actually exercise every branch; a vacuous comparison proves nothing.
    expect(compared).toBe(1800);
    expect(found).toBe(1600);
    for (const count of [
      withAddress,
      withContact,
      withFinanceContact,
      withVenue,
      withManager,
      deleted,
    ]) {
      expect(count).toBeGreaterThan(100);
    }
  });
});
