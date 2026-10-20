import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/quote-detail-01-reactive-quote.md §7 (test 3).
//
// The hook is rendered on the server with `useTypedQuery` replaced, so each of its six queries
// can be made to answer, load or fail. What happens when the data changes between renders (a
// re-run after a commit, a new event id) is decided by `resolveQuoteDetail` and `reuseQuote`,
// which `quoteDetailData.test.ts` covers directly; there is no client renderer in this repo.

type Part = { data: unknown[]; isLoading: boolean; isFetching: boolean; error?: Error };

const mocks = vi.hoisted(() => ({
  answers: {} as Record<string, Part>,
  seen: [] as string[],
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

/** Which of the six queries a compiled one is. */
function which(sql: string): string {
  if (sql.includes("finance_contact_uuid")) return "financeContact";
  if (sql.includes('from "Contacts"')) return "contact";
  if (sql.includes('from "Addresses"')) return "address";
  if (sql.includes('from "Venues"')) return "venue";
  if (sql.includes('from "Users"')) return "accountManager";
  return "event";
}

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string }) => {
    const key = which(compiled.sql);
    mocks.seen.push(key);
    return mocks.answers[key];
  },
}));

import { useQuoteDetail } from "./useQuoteDetail";

const KEYS = ["event", "address", "venue", "contact", "financeContact", "accountManager"] as const;

const answered = (data: unknown[]): Part => ({ data, isLoading: false, isFetching: false });
const loading: Part = { data: [], isLoading: true, isFetching: true };

function eventRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    event_name: "Spring Gala",
    event_status: "quoted",
    created_by_user_uuid: "user-1",
    deleted: 0,
    is_tax_overridden: 0,
    ...over,
  };
}

function setAnswers(over: Partial<Record<(typeof KEYS)[number], Part>> = {}) {
  mocks.answers = {
    event: answered([eventRow("ev-1")]),
    address: answered([]),
    venue: answered([]),
    contact: answered([
      { id: "c1", first_name: "Dana", last_name: "Whitfield", email: null, phone: null },
    ]),
    financeContact: answered([]),
    accountManager: answered([{ id: "user-1", first_name: "Sam", last_name: "Lee" }]),
    ...over,
  };
}

function Probe({ eventId }: { eventId: string }) {
  const { quote, isLoading, error } = useQuoteDetail(eventId);
  return (
    <pre>
      {JSON.stringify({
        isLoading,
        error: error?.message ?? null,
        title: quote?.eventName ?? null,
        contact: quote?.contact?.firstName ?? null,
        manager: quote?.accountManager?.firstName ?? null,
      })}
    </pre>
  );
}

function read(eventId = "ev-1") {
  const html = renderToStaticMarkup(<Probe eventId={eventId} />);
  const json = html
    .replace(/^<pre>/, "")
    .replace(/<\/pre>$/, "")
    .replaceAll("&quot;", '"');
  return JSON.parse(json) as {
    isLoading: boolean;
    error: string | null;
    title: string | null;
    contact: string | null;
    manager: string | null;
  };
}

beforeEach(() => {
  mocks.seen = [];
  setAnswers();
});

describe("useQuoteDetail", () => {
  it("runs the six queries, one per table, and no more", () => {
    read();
    // Settling sets the "answered for" state while rendering, so React renders the component once
    // more at once: every query is asked once per pass, never twice in one.
    const perQuery = KEYS.map((key) => mocks.seen.filter((seen) => seen === key).length);
    expect([...new Set(mocks.seen)].sort()).toEqual([...KEYS].sort());
    expect(new Set(perQuery).size).toBe(1);
    expect(mocks.seen).toHaveLength(6 * perQuery[0]);
  });

  it("is loading while the queries have not answered", () => {
    setAnswers({
      event: loading,
      address: loading,
      venue: loading,
      contact: loading,
      financeContact: loading,
      accountManager: loading,
    });
    expect(read()).toMatchObject({ isLoading: true, title: null, error: null });
  });

  it("is still loading while a single query is on its first run", () => {
    setAnswers({ accountManager: loading });
    expect(read()).toMatchObject({ isLoading: true, title: null });
  });

  it("gives the quote, joined from the six answers, once all have answered", () => {
    expect(read()).toEqual({
      isLoading: false,
      error: null,
      title: "Spring Gala",
      contact: "Dana",
      manager: "Sam",
    });
  });

  it("says there is no quote, and is not loading, when the event row is not there", () => {
    setAnswers({ event: answered([]) });
    expect(read()).toMatchObject({ isLoading: false, title: null, error: null });
  });

  it("never gives another event's row", () => {
    setAnswers({ event: answered([eventRow("ev-1")]) });
    // The watcher still holds the rows of ev-1 while the page asks for ev-2.
    expect(read("ev-2")).toMatchObject({ isLoading: true, title: null });
  });

  it("gives no quote and the error when one query fails", () => {
    setAnswers({
      venue: { data: [], isLoading: false, isFetching: false, error: new Error("boom") },
    });
    expect(read()).toMatchObject({ isLoading: false, title: null, error: "boom" });
  });
});
