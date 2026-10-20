import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/quote-detail-03-history-panels.md §7 (test 3).
//
// Both hooks are rendered on the server with `useTypedQuery` replaced, which shows one state at a
// time. What they decide is the shape of the answer: loading, the two buckets, and empty buckets
// when the read fails. The split into Past and Future and the order inside each is the pure
// bucketing functions' job, which `fetchContactEvents.test.ts` and `fetchVenueEvents.test.ts`
// cover.

type Answer = { data: unknown[]; isLoading: boolean; error?: Error };

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false } as Answer,
  queries: [] as Array<{ sql: string; parameters: unknown[] }>,
}));

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
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string; parameters: unknown[] }) => {
    mocks.queries.push(compiled);
    return mocks.answer;
  },
}));

import { useContactEvents } from "./useContactEvents";
import { useVenueEvents } from "./useVenueEvents";

const PAST = "2020-01-02";
const FUTURE = "2099-01-01";

function contactRow(id: string, end: string | null, over: Record<string, unknown> = {}) {
  return {
    id,
    event_name: `Event ${id}`,
    invoice_number: 1,
    event_start: "2020-01-01",
    event_end: end,
    event_status: "booked",
    contact_uuid: "c0",
    finance_contact_uuid: null,
    ...over,
  };
}

function ContactProbe() {
  const { buckets, isLoading } = useContactEvents("c0");
  return (
    <pre>
      {JSON.stringify({
        isLoading,
        loaded: buckets !== null,
        past: buckets?.past.map((e) => `${e.id}:${e.relation}`) ?? null,
        future: buckets?.future.map((e) => `${e.id}:${e.relation}`) ?? null,
      })}
    </pre>
  );
}

function VenueProbe() {
  const { buckets, isLoading } = useVenueEvents("v0");
  return (
    <pre>
      {JSON.stringify({
        isLoading,
        loaded: buckets !== null,
        past: buckets?.past.map((e) => e.id) ?? null,
        future: buckets?.future.map((e) => e.id) ?? null,
      })}
    </pre>
  );
}

const read = (element: React.ReactElement) =>
  JSON.parse(
    renderToStaticMarkup(element)
      .replace(/^<pre>/, "")
      .replace(/<\/pre>$/, "")
      .replaceAll("&quot;", '"'),
  );

beforeEach(() => {
  mocks.answer = { data: [], isLoading: false };
  mocks.queries = [];
});

describe("useContactEvents", () => {
  it("watches the contact's events query", () => {
    read(<ContactProbe />);
    expect(mocks.queries[0].sql).toMatch(/from "Events" where "deleted" = \?/);
    expect(mocks.queries[0].parameters).toEqual([0, "c0", "c0"]);
  });

  it("has no buckets and is loading until the query has answered", () => {
    mocks.answer = { data: [], isLoading: true };
    expect(read(<ContactProbe />)).toEqual({
      isLoading: true,
      loaded: false,
      past: null,
      future: null,
    });
  });

  it("splits the rows into Past and Future, and tags each with why it matched", () => {
    mocks.answer = {
      data: [
        contactRow("old", PAST),
        contactRow("new", FUTURE),
        contactRow("fin", FUTURE, { contact_uuid: "other", finance_contact_uuid: "c0" }),
      ],
      isLoading: false,
    };
    const state = read(<ContactProbe />);
    expect(state.past).toEqual(["old:primary"]);
    expect([...state.future].sort()).toEqual(["fin:finance", "new:primary"]);
  });

  it("gives empty lists, not a loading screen, when there is nothing", () => {
    expect(read(<ContactProbe />)).toEqual({
      isLoading: false,
      loaded: true,
      past: [],
      future: [],
    });
  });

  it("gives empty lists when the read fails, as the old fetcher's catch did", () => {
    mocks.answer = { data: [], isLoading: false, error: new Error("boom") };
    expect(read(<ContactProbe />)).toEqual({
      isLoading: false,
      loaded: true,
      past: [],
      future: [],
    });
  });
});

describe("useVenueEvents", () => {
  it("watches the venue's events query", () => {
    read(<VenueProbe />);
    expect(mocks.queries[0].sql).toMatch(/"venue_uuid" = \?/);
    expect(mocks.queries[0].parameters).toEqual([0, "v0"]);
  });

  it("has no buckets and is loading until the query has answered", () => {
    mocks.answer = { data: [], isLoading: true };
    expect(read(<VenueProbe />)).toMatchObject({ isLoading: true, loaded: false });
  });

  it("splits the rows into Past and Future", () => {
    mocks.answer = {
      data: [
        {
          id: "old",
          event_name: "a",
          invoice_number: 1,
          event_start: null,
          event_end: PAST,
          event_status: null,
        },
        {
          id: "new",
          event_name: "b",
          invoice_number: 2,
          event_start: null,
          event_end: FUTURE,
          event_status: null,
        },
        {
          id: "open",
          event_name: "c",
          invoice_number: 3,
          event_start: null,
          event_end: null,
          event_status: null,
        },
      ],
      isLoading: false,
    };
    const state = read(<VenueProbe />);
    expect(state.past).toEqual(["old"]);
    expect([...state.future].sort()).toEqual(["new", "open"]);
  });

  it("gives empty lists when the read fails", () => {
    mocks.answer = { data: [], isLoading: false, error: new Error("boom") };
    expect(read(<VenueProbe />)).toEqual({ isLoading: false, loaded: true, past: [], future: [] });
  });
});
