import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// docs/specs/accountant-kpi.md §2.3 and §5. The SQL runs on a real SQLite database behind the same
// bound proxy the app's `db` is (it strips `db.fn`, which is why the aggregates use the callback
// form); the hook is checked with useTypedQuery mocked, as useAuditTrackers.test.tsx does.
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});
const boundDb = new Proxy({} as Kysely<any>, {
  get(_target, prop) {
    const value = (testDb as any)[prop];
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});
vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return boundDb;
  },
}));

type QueryResult = { data: unknown[] | undefined; isLoading: boolean; error: Error | undefined };

const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  currencies: { currencyByOfficeId: new Map<string, string>(), isLoading: false },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string }) => {
    const table = Object.keys(state.results).find((t) => compiled.sql.includes(`from "${t}"`));
    return table ? state.results[table] : { data: undefined, isLoading: true, error: undefined };
  },
}));
vi.mock("@/features/quotesAndBookings/hooks/useOfficeCurrencies", () => ({
  useOfficeCurrencies: () => state.currencies,
}));

const queries = await import("./useKpiData");
const { useKpiData } = queries;

let sqlite: DatabaseSync;
const run = (compiled: { sql: string; parameters: readonly unknown[] }) =>
  sqlite.prepare(compiled.sql).all(...(compiled.parameters as any[])) as any[];

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "Events" (
      id text primary key, event_status text, deleted integer, sales_office_uuid text,
      tax_percent real, tax_amount_cents integer, booked_at text
    );
    create table "EventLineItems" (
      id text primary key, event_uuid text, quantity integer, value_cents integer, deleted integer
    );
    create table "PaymentInstallments" (
      id text primary key, event_uuid text, due_date text, percentage_bps integer,
      due_on_signing integer
    );
    create table "PaymentHistory" (
      id text primary key, event_uuid text, installment_id text, amount_cents integer,
      currency text, status text, paid_at text, created_at text, deleted_at text
    );
    create table "ContractSignatures" (
      id text primary key, event_uuid text, signed_at text, status text
    );
  `);
});

describe("the events query (C1, D4)", () => {
  it("returns booked, not deleted events and nothing else", () => {
    sqlite.exec(`
      insert into "Events" values
        ('b1', 'booked', 0, 'o1', 13, 100, '2026-11-02 15:00:00+00'),
        ('b2', 'booked', 1, null, null, null, null),
        ('u1', 'unsigned_changes', 0, null, null, null, null),
        ('q1', 'quoted', 0, null, null, null, null),
        ('l1', 'lost', 0, null, null, null, null),
        ('d1', 'draft', 0, null, null, null, null);
    `);
    const rows = run(queries.buildKpiEventsQuery().compile());
    expect(rows).toEqual([
      {
        id: "b1",
        sales_office_uuid: "o1",
        tax_percent: 13,
        tax_amount_cents: 100,
        booked_at: "2026-11-02 15:00:00+00",
      },
    ]);
  });
});

describe("the line totals query", () => {
  it("sums quantity x value per event, a missing quantity as 1, deleted lines left out", () => {
    sqlite.exec(`
      insert into "EventLineItems" values
        ('l1', 'e1', 2, 50000, 0),
        ('l2', 'e1', null, 10000, 0),
        ('l3', 'e1', 5, 99999, 1),
        ('l4', 'e2', 1, 7000, 0);
    `);
    const rows = run(queries.buildKpiLineTotalsQuery().compile());
    const byEvent = Object.fromEntries(rows.map((r) => [r.event_uuid, r.line_total_cents]));
    expect(byEvent).toEqual({ e1: 110000, e2: 7000 });
  });
});

describe("the installments query", () => {
  it("returns the columns the schedule is read from, with the due-on-signing mark", () => {
    sqlite.exec(`
      insert into "PaymentInstallments" values ('i1', 'e1', '2026-11-02', 5000, 1);
    `);
    expect(run(queries.buildKpiInstallmentsQuery().compile())).toEqual([
      {
        id: "i1",
        event_uuid: "e1",
        due_date: "2026-11-02",
        percentage_bps: 5000,
        due_on_signing: 1,
      },
    ]);
  });
});

describe("the payments query", () => {
  it("returns every payment with the columns the allocation needs, deleted ones included", () => {
    sqlite.exec(`
      insert into "PaymentHistory" values
        ('p1', 'e1', 'i1', 100000, 'USD', 'succeeded', '2026-11-04 17:00:00+00', '2026-11-04 17:00:00+00', null),
        ('p2', 'e1', null, 5000, 'USD', 'succeeded', null, '2026-11-05 17:00:00+00', '2026-11-06 00:00:00+00');
    `);
    const rows = run(queries.buildKpiPaymentsQuery().compile());
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "amount_cents",
        "created_at",
        "currency",
        "deleted_at",
        "event_uuid",
        "id",
        "installment_id",
        "paid_at",
        "status",
      ].sort(),
    );
  });
});

describe("the first signatures query (D9)", () => {
  it("is the earliest signature of each event, of any status", () => {
    sqlite.exec(`
      insert into "ContractSignatures" values
        ('s1', 'e1', '2026-11-05 15:00:00+00', 'invalidated'),
        ('s2', 'e1', '2026-11-03 15:00:00+00', 'active'),
        ('s3', 'e2', '2026-11-09 15:00:00+00', 'active');
    `);
    const rows = run(queries.buildKpiFirstSignaturesQuery().compile());
    const byEvent = Object.fromEntries(rows.map((r) => [r.event_uuid, r.first_signed_at]));
    expect(byEvent).toEqual({
      e1: "2026-11-03 15:00:00+00",
      e2: "2026-11-09 15:00:00+00",
    });
  });
});

describe("the hook", () => {
  const ready = (data: unknown[]): QueryResult => ({ data, isLoading: false, error: undefined });
  let seen: ReturnType<typeof useKpiData> | null = null;
  function Probe() {
    seen = useKpiData();
    return null;
  }
  const render = () => renderToStaticMarkup(<Probe />);

  beforeEach(() => {
    seen = null;
    state.currencies = { currencyByOfficeId: new Map(), isLoading: false };
    state.results = {
      Events: ready([
        {
          id: "E",
          sales_office_uuid: null,
          tax_percent: null,
          tax_amount_cents: null,
          booked_at: null,
        },
      ]),
      EventLineItems: ready([{ event_uuid: "E", line_total_cents: 100000 }]),
      PaymentInstallments: ready([
        {
          id: "I1",
          event_uuid: "E",
          due_date: "2026-11-01",
          percentage_bps: 10000,
          due_on_signing: 1,
        },
      ]),
      PaymentHistory: ready([
        {
          id: "P1",
          event_uuid: "E",
          installment_id: null,
          amount_cents: 100000,
          currency: "USD",
          status: "succeeded",
          paid_at: "2026-11-03 17:00:00+00",
          created_at: "2026-11-03 17:00:00+00",
          deleted_at: null,
        },
      ]),
      ContractSignatures: ready([]),
    };
  });

  it("gives the collected payments once everything has loaded", () => {
    render();
    expect(seen!.isLoading).toBe(false);
    expect(seen!.error).toBeUndefined();
    expect(seen!.rows).toEqual([
      {
        eventId: "E",
        paymentId: "I1",
        role: "final",
        dueDate: "2026-11-01",
        collectedDay: "2026-11-03",
        days: 2,
      },
    ]);
  });

  it("has no rows, and is loading, while any one of the queries is loading", () => {
    state.results.PaymentHistory = { data: undefined, isLoading: true, error: undefined };
    render();
    expect(seen!.isLoading).toBe(true);
    expect(seen!.rows).toBeUndefined();
  });

  it("is loading while the office currencies load: a Canadian event would be counted in USD", () => {
    state.currencies = { currencyByOfficeId: new Map(), isLoading: true };
    render();
    expect(seen!.isLoading).toBe(true);
    expect(seen!.rows).toBeUndefined();
  });

  it("reports the first error and has no rows", () => {
    const boom = new Error("boom");
    state.results.ContractSignatures = { data: undefined, isLoading: false, error: boom };
    render();
    expect(seen!.error).toBe(boom);
    expect(seen!.rows).toBeUndefined();
  });

  it("takes the event's currency from its sales office", () => {
    state.currencies = { currencyByOfficeId: new Map([["office-ca", "CAD"]]), isLoading: false };
    state.results.Events = ready([
      {
        id: "E",
        sales_office_uuid: "office-ca",
        tax_percent: null,
        tax_amount_cents: null,
        booked_at: null,
      },
    ]);
    render();
    // The payment is in USD and the event is in CAD: it does not count.
    expect(seen!.rows).toEqual([]);
  });
});
