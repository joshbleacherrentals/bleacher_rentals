import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import {
  buildQuoteDetailQueries,
  mergeQuoteDetail,
  resolveQuoteDetail,
  reuseQuote,
  type PartStatus,
  type QuoteDetailParts,
} from "./quoteDetailData";

// Spec: docs/specs/quote-detail-01-reactive-quote.md §3 and §7.
//
// The pure half of the reactive quote detail: the six small queries, the merge that returns what
// `fetchQuoteDetail` returns, and the two small rules the hook leans on (when the page may show a
// quote, and when a re-run keeps the same object).

const compileOnlyDb = new Kysely<PowerSyncDB>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const EVENT_ID = "ev-1";

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    invoice_number: 1042,
    event_name: "Spring Gala",
    event_status: "quoted",
    lost_reason: null,
    lost_reason_note: null,
    event_start: "2026-05-01",
    event_end: "2026-05-03",
    setup_start: "2026-04-30",
    teardown_end: "2026-05-04",
    notes: "client note",
    internal_notes: "internal note",
    external_notes: "external note",
    pickup_instructions: "pickup",
    dropoff_instructions: "dropoff",
    contract_revenue_cents: 125000,
    event_type_uuid: "type-1",
    quote_valid_till: "2026-04-15",
    sales_office_uuid: "office-1",
    terms_and_conditions_uuid: "terms-1",
    tax_percent: 13,
    tax_amount_cents: 14500,
    is_tax_overridden: 0,
    booked_at: null,
    created_at: "2026-03-01T10:00:00Z",
    created_by_user_uuid: "user-1",
    deleted: 0,
    ...over,
  };
}

function parts(over: Partial<QuoteDetailParts> = {}): QuoteDetailParts {
  return {
    eventId: EVENT_ID,
    event: [eventRow()],
    address: [],
    venue: [],
    contact: [],
    financeContact: [],
    accountManager: [],
    ...over,
  } as QuoteDetailParts;
}

describe("buildQuoteDetailQueries", () => {
  const queries = buildQuoteDetailQueries(compileOnlyDb, EVENT_ID);

  it("builds one query per table, six in all", () => {
    expect(Object.keys(queries).sort()).toEqual(
      ["accountManager", "address", "contact", "event", "financeContact", "venue"].sort(),
    );
  });

  it("binds every query to the event id and nothing else", () => {
    for (const compiled of Object.values(queries)) {
      expect(compiled.parameters).toEqual([EVENT_ID]);
    }
  });

  it("has no JOIN: a commit to one table must re-run only that table's query", () => {
    for (const compiled of Object.values(queries)) {
      expect(compiled.sql).not.toMatch(/\bjoin\b/i);
    }
  });

  it("reads each related row through the event's own foreign key", () => {
    expect(queries.address.sql).toMatch(
      /from "Addresses"[\s\S]*"id" in \(select "address_uuid" from "Events" where "id" = \?\)/,
    );
    expect(queries.venue.sql).toMatch(
      /from "Venues"[\s\S]*"id" in \(select "venue_uuid" from "Events" where "id" = \?\)/,
    );
    expect(queries.contact.sql).toMatch(
      /from "Contacts"[\s\S]*"id" in \(select "contact_uuid" from "Events" where "id" = \?\)/,
    );
    expect(queries.financeContact.sql).toMatch(
      /from "Contacts"[\s\S]*"id" in \(select "finance_contact_uuid" from "Events" where "id" = \?\)/,
    );
    expect(queries.accountManager.sql).toMatch(
      /from "Users"[\s\S]*"id" in \(select "created_by_user_uuid" from "Events" where "id" = \?\)/,
    );
  });

  it("reads the event by its primary key", () => {
    expect(queries.event.sql).toMatch(/from "Events" where "id" = \?/);
  });
});

describe("mergeQuoteDetail", () => {
  it("returns null when there is no event row", () => {
    expect(mergeQuoteDetail(parts({ event: [] }))).toBeNull();
  });

  it("returns null when the event row is another event's (a stale answer)", () => {
    expect(mergeQuoteDetail(parts({ event: [eventRow({ id: "ev-other" })] as never }))).toBeNull();
  });

  it("carries every event column to its QuoteDetail field", () => {
    const quote = mergeQuoteDetail(parts());
    expect(quote).toMatchObject({
      id: EVENT_ID,
      invoiceNumber: 1042,
      eventName: "Spring Gala",
      eventStatus: "quoted",
      lostReason: null,
      lostReasonNote: null,
      eventStart: "2026-05-01",
      eventEnd: "2026-05-03",
      setupStart: "2026-04-30",
      teardownEnd: "2026-05-04",
      notes: "client note",
      internalNotes: "internal note",
      externalNotes: "external note",
      pickupInstructions: "pickup",
      dropoffInstructions: "dropoff",
      contractRevenueCents: 125000,
      eventTypeUuid: "type-1",
      quoteValidTill: "2026-04-15",
      salesOfficeUuid: "office-1",
      termsAndConditionsUuid: "terms-1",
      taxPercent: 13,
      taxAmountCents: 14500,
      bookedAt: null,
      createdAt: "2026-03-01T10:00:00Z",
      createdByUserUuid: "user-1",
    });
  });

  it("reads the two flags as exactly 1", () => {
    const on = mergeQuoteDetail(
      parts({ event: [eventRow({ is_tax_overridden: 1, deleted: 1 })] as never }),
    );
    expect(on).toMatchObject({ isTaxOverridden: true, deleted: true });

    for (const value of [0, null]) {
      const off = mergeQuoteDetail(
        parts({ event: [eventRow({ is_tax_overridden: value, deleted: value })] as never }),
      );
      expect(off).toMatchObject({ isTaxOverridden: false, deleted: false });
    }
  });

  it("has no address, venue, contacts or account manager when their rows are missing", () => {
    expect(mergeQuoteDetail(parts())).toMatchObject({
      address: null,
      venue: null,
      contact: null,
      financeContact: null,
      accountManager: null,
    });
  });

  describe("address", () => {
    it("is built from the row", () => {
      const quote = mergeQuoteDetail(
        parts({
          address: [
            {
              id: "a1",
              street: "1 Main St",
              city: "Toronto",
              state_province: "ON",
              zip_postal: "M5V",
            },
          ] as never,
        }),
      );
      expect(quote?.address).toEqual({
        street: "1 Main St",
        city: "Toronto",
        stateProvince: "ON",
        zipPostal: "M5V",
      });
    });

    it("is null when the street is empty or missing, whatever else the row holds", () => {
      for (const street of ["", null]) {
        const quote = mergeQuoteDetail(
          parts({
            address: [
              { id: "a1", street, city: "Toronto", state_province: "ON", zip_postal: "M5V" },
            ] as never,
          }),
        );
        expect(quote?.address).toBeNull();
      }
    });

    it("turns a missing city or province into an empty string and keeps a missing zip null", () => {
      const quote = mergeQuoteDetail(
        parts({
          address: [
            { id: "a1", street: "1 Main St", city: null, state_province: null, zip_postal: null },
          ] as never,
        }),
      );
      expect(quote?.address).toEqual({
        street: "1 Main St",
        city: "",
        stateProvince: "",
        zipPostal: null,
      });
    });
  });

  describe("venue", () => {
    it("is its id and name", () => {
      const quote = mergeQuoteDetail(parts({ venue: [{ id: "v1", name: "Arena" }] as never }));
      expect(quote?.venue).toEqual({ id: "v1", name: "Arena" });
    });

    it("has an empty name when the row's name is missing", () => {
      const quote = mergeQuoteDetail(parts({ venue: [{ id: "v1", name: null }] as never }));
      expect(quote?.venue).toEqual({ id: "v1", name: "" });
    });
  });

  describe("contacts", () => {
    const contact = {
      id: "c1",
      first_name: "Dana",
      last_name: "Whitfield",
      email: "dana@example.com",
      phone: "555-0100",
    };

    it("carries id, names, email and phone", () => {
      const quote = mergeQuoteDetail(
        parts({ contact: [contact] as never, financeContact: [{ ...contact, id: "c2" }] as never }),
      );
      expect(quote?.contact).toEqual({
        id: "c1",
        firstName: "Dana",
        lastName: "Whitfield",
        email: "dana@example.com",
        phone: "555-0100",
      });
      expect(quote?.financeContact?.id).toBe("c2");
    });

    it("keeps a missing last name null and turns a missing first name into an empty string", () => {
      const quote = mergeQuoteDetail(
        parts({ contact: [{ ...contact, first_name: null, last_name: null }] as never }),
      );
      expect(quote?.contact).toMatchObject({ firstName: "", lastName: null });
    });

    it("lets the same contact be both the contact and the finance contact", () => {
      const quote = mergeQuoteDetail(
        parts({ contact: [contact] as never, financeContact: [contact] as never }),
      );
      expect(quote?.contact).toEqual(quote?.financeContact);
    });
  });

  describe("account manager", () => {
    it("is the creator's names", () => {
      const quote = mergeQuoteDetail(
        parts({ accountManager: [{ id: "user-1", first_name: "Sam", last_name: "Lee" }] as never }),
      );
      expect(quote?.accountManager).toEqual({ firstName: "Sam", lastName: "Lee" });
    });

    it("is kept when only one name is set", () => {
      const quote = mergeQuoteDetail(
        parts({ accountManager: [{ id: "user-1", first_name: "Sam", last_name: null }] as never }),
      );
      expect(quote?.accountManager).toEqual({ firstName: "Sam", lastName: null });
    });

    it("is null when both names are missing or empty", () => {
      for (const [first, last] of [
        [null, null],
        ["", ""],
        [null, ""],
      ]) {
        const quote = mergeQuoteDetail(
          parts({
            accountManager: [{ id: "user-1", first_name: first, last_name: last }] as never,
          }),
        );
        expect(quote?.accountManager).toBeNull();
      }
    });
  });
});

describe("resolveQuoteDetail: when the page may show a quote", () => {
  const settled: PartStatus = { isLoading: false, isFetching: false };
  const fetching: PartStatus = { isLoading: false, isFetching: true };
  const six = (status: PartStatus): PartStatus[] => Array.from({ length: 6 }, () => status);
  const answered = parts();
  // The hook builds the parts for the NEW event id, but the watcher still holds the OLD rows.
  const staleForEv2 = parts({ eventId: "ev-2" });

  it("is loading until every one of the six queries has answered", () => {
    const state = resolveQuoteDetail({
      answeredFor: null,
      parts: parts({ event: [] }),
      statuses: [{ isLoading: true, isFetching: true }, ...six(settled).slice(1)],
    });
    expect(state).toMatchObject({ isLoading: true, quote: null, error: null, answeredFor: null });
  });

  it("is loading while one query is still on its first run", () => {
    const state = resolveQuoteDetail({
      answeredFor: null,
      parts: answered,
      statuses: [...six(settled).slice(0, 5), { isLoading: true, isFetching: true }],
    });
    expect(state.isLoading).toBe(true);
    expect(state.quote).toBeNull();
  });

  it("shows the quote once all six have answered, and remembers for which event", () => {
    const state = resolveQuoteDetail({
      answeredFor: null,
      parts: answered,
      statuses: six(settled),
    });
    expect(state.isLoading).toBe(false);
    expect(state.quote?.id).toBe(EVENT_ID);
    expect(state.answeredFor).toBe(EVENT_ID);
  });

  it("does not go back to loading when a query re-runs after a commit", () => {
    const state = resolveQuoteDetail({
      answeredFor: EVENT_ID,
      parts: answered,
      statuses: six(fetching),
    });
    expect(state.isLoading).toBe(false);
    expect(state.quote?.id).toBe(EVENT_ID);
  });

  it("says not found, not loading, when all six answered and there is no event row", () => {
    const state = resolveQuoteDetail({
      answeredFor: null,
      parts: parts({ event: [] }),
      statuses: six(settled),
    });
    expect(state).toMatchObject({ isLoading: false, quote: null, error: null });
    expect(state.answeredFor).toBe(EVENT_ID);
  });

  it("never returns the previous quote when the event id changes", () => {
    const state = resolveQuoteDetail({
      answeredFor: EVENT_ID,
      parts: staleForEv2,
      statuses: six(fetching),
    });
    expect(state.isLoading).toBe(true);
    expect(state.quote).toBeNull();
    expect(state.answeredFor).toBe(EVENT_ID);
  });

  it("treats a settled answer that holds another event's row as still loading", () => {
    const state = resolveQuoteDetail({
      answeredFor: EVENT_ID,
      parts: staleForEv2,
      statuses: six(settled),
    });
    expect(state.isLoading).toBe(true);
    expect(state.quote).toBeNull();
    expect(state.answeredFor).toBe(EVENT_ID);
  });

  it("is loading, not not-found, when the id changed and the old answer was an empty one", () => {
    const state = resolveQuoteDetail({
      answeredFor: "ev-gone",
      parts: parts({ eventId: "ev-2", event: [] }),
      statuses: six(fetching),
    });
    expect(state.isLoading).toBe(true);
    expect(state.quote).toBeNull();
  });

  it("shows the new quote once the new event's answers have arrived", () => {
    const next = parts({
      eventId: "ev-2",
      event: [eventRow({ id: "ev-2", event_name: "Other" })] as never,
    });
    const state = resolveQuoteDetail({
      answeredFor: EVENT_ID,
      parts: next,
      statuses: six(settled),
    });
    expect(state.isLoading).toBe(false);
    expect(state.quote).toMatchObject({ id: "ev-2", eventName: "Other" });
    expect(state.answeredFor).toBe("ev-2");
  });

  it("reports the first error and shows no quote", () => {
    const boom = new Error("boom");
    const state = resolveQuoteDetail({
      answeredFor: null,
      parts: answered,
      statuses: [
        ...six(settled).slice(0, 3),
        { isLoading: false, isFetching: false, error: boom },
        ...six(settled).slice(0, 2),
      ],
    });
    expect(state).toMatchObject({ isLoading: false, quote: null });
    expect(state.error).toBe(boom);
  });
});

describe("reuseQuote: a re-run with the same data keeps the same object", () => {
  const quote = () => mergeQuoteDetail(parts())!;

  it("returns the previous object when nothing changed", () => {
    const previous = quote();
    expect(reuseQuote(previous, quote())).toBe(previous);
  });

  it("returns the new object when one field changed", () => {
    const previous = quote();
    const next = mergeQuoteDetail(
      parts({ event: [eventRow({ event_name: "Renamed" })] as never }),
    )!;
    expect(reuseQuote(previous, next)).toBe(next);
  });

  it("returns the new object when a nested field changed", () => {
    const previous = mergeQuoteDetail(parts({ venue: [{ id: "v1", name: "Arena" }] as never }))!;
    const next = mergeQuoteDetail(parts({ venue: [{ id: "v1", name: "Stadium" }] as never }))!;
    expect(reuseQuote(previous, next)).toBe(next);
  });

  it("returns the new value when there was no previous one", () => {
    const next = quote();
    expect(reuseQuote(null, next)).toBe(next);
  });

  it("returns null when there is no longer a quote", () => {
    expect(reuseQuote(quote(), null)).toBeNull();
  });
});
