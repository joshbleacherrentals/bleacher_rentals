import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-07-collections-list.md §3 and §4. The hook is rendered on
// the server with `useTypedQuery` replaced: what is under test is the four questions it asks the
// local database and how it turns the answers into rows.

type Compiled = { sql: string; parameters: unknown[] };
type Answer = { data: unknown[] | undefined; isLoading: boolean; error: Error | undefined };

const mocks = vi.hoisted(() => ({
  compiled: [] as Compiled[],
  answers: {} as Record<string, Answer>,
  today: "2026-11-15",
  currencies: new Map<string, "USD" | "CAD">(),
  officesLoading: false,
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
  useTypedQuery: (compiled: Compiled) => {
    mocks.compiled.push(compiled);
    return (
      mocks.answers[outerTable(compiled.sql)] ?? { data: [], isLoading: false, error: undefined }
    );
  },
}));
vi.mock("@/lib/useTimezoneStore", () => ({
  useTimezoneStore: (selector: (state: { timezone: string }) => unknown) =>
    selector({ timezone: "America/Toronto" }),
}));
vi.mock("@/features/quotesAndBookings/hooks/useToday", () => ({
  useToday: () => mocks.today,
}));
vi.mock("@/features/quotesAndBookings/hooks/useOfficeCurrencies", () => ({
  useOfficeCurrencies: () => ({
    currencyByOfficeId: mocks.currencies,
    isLoading: mocks.officesLoading,
  }),
}));

import { useCollectionsData } from "./useCollectionsData";

/** The table of the outermost FROM: the select list of these queries holds no subquery. */
function outerTable(sql: string): string {
  return /\bfrom "(\w+)"/.exec(sql)?.[1] ?? "";
}

function Probe() {
  const { rows, isLoading, error, today } = useCollectionsData();
  return <p>{JSON.stringify({ rows, isLoading, error: error?.message ?? null, today })}</p>;
}

const drawn = () =>
  JSON.parse(
    renderToStaticMarkup(<Probe />)
      .replace(/<\/?p>/g, "")
      .replaceAll("&quot;", '"'),
  );

const queryOn = (table: string) => mocks.compiled.find((c) => outerTable(c.sql) === table)!;
const done = (data: unknown[]): Answer => ({ data, isLoading: false, error: undefined });

beforeEach(() => {
  mocks.compiled = [];
  mocks.answers = {};
  mocks.today = "2026-11-15";
  mocks.currencies = new Map();
  mocks.officesLoading = false;
});

describe("useCollectionsData: the task query", () => {
  it("reads the open tasks of booked, non-deleted events, joined to Events", () => {
    drawn();

    const { sql, parameters } = queryOn("ArEventTasks");
    expect(sql).toMatch(/inner join "Events"/i);
    expect(sql).toContain('"completed" = ?');
    expect(sql).toContain('"event_status" = ?');
    expect(sql).toContain('"deleted" = ?');
    // completed = 0, event_status = 'booked', deleted = 0
    expect(parameters).toEqual([0, "booked", 0]);
  });

  it("reads the columns the rows are built from, and no others", () => {
    drawn();

    const { sql } = queryOn("ArEventTasks");
    for (const column of [
      "due_date",
      "note",
      "created_at",
      "event_name",
      "event_start",
      "booked_at",
      "tax_percent",
      "tax_amount_cents",
      "sales_office_uuid",
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
  });
});

describe("useCollectionsData: the other three queries", () => {
  it("limit line totals, installments and payments to the events that have an open task", () => {
    drawn();

    for (const table of ["EventLineItems", "PaymentInstallments", "PaymentHistory"]) {
      const { sql, parameters } = queryOn(table);
      expect(sql, table).toMatch(
        /"event_uuid" in \(select "event_uuid" from "ArEventTasks" where "completed" = \?\)/i,
      );
      expect(parameters, table).toContain(0);
    }
  });

  it("sum the line totals in SQL and leave deleted line items out", () => {
    drawn();

    const { sql } = queryOn("EventLineItems");
    expect(sql).toMatch(/sum\(/i);
    expect(sql).toMatch(/group by "event_uuid"/i);
    expect(sql).toContain('"deleted" = ?');
  });

  it("asks four questions in all, and no more", () => {
    drawn();

    expect(mocks.compiled.map((c) => outerTable(c.sql)).sort()).toEqual([
      "ArEventTasks",
      "EventLineItems",
      "PaymentHistory",
      "PaymentInstallments",
    ]);
  });
});

describe("useCollectionsData: the rows", () => {
  const taskRow = {
    task_id: "task-1",
    created_at: "2026-11-01T05:20:00.000Z",
    due_date: "2026-11-15",
    note: "Remind the customer about payment",
    event_uuid: "evt-1",
    event_name: "Fall Classic",
    event_start: "2027-06-01",
    booked_at: "2026-09-01T12:00:00+00:00",
    tax_percent: null,
    tax_amount_cents: null,
    sales_office_uuid: "office-ca",
  };

  it("builds a row from the answers, in the office's currency, and hands back today", () => {
    mocks.currencies = new Map([["office-ca", "CAD"]]);
    mocks.answers = {
      ArEventTasks: done([taskRow]),
      EventLineItems: done([{ event_uuid: "evt-1", line_total_cents: 100000 }]),
      PaymentInstallments: done([
        { id: "i-1", event_uuid: "evt-1", due_date: "2026-11-05", percentage_bps: 10000 },
      ]),
      PaymentHistory: done([]),
    };

    expect(drawn()).toEqual({
      rows: [
        {
          eventId: "evt-1",
          eventName: "Fall Classic",
          taskId: "task-1",
          dueDate: "2026-11-15",
          note: "Remind the customer about payment",
          amountDueCents: 100000,
          currency: "CAD",
          daysOverdue: 10,
        },
      ],
      isLoading: false,
      error: null,
      today: "2026-11-15",
    });
  });

  it("falls back to USD for an office whose currency is unknown", () => {
    mocks.answers = { ArEventTasks: done([taskRow]) };

    expect(drawn().rows[0].currency).toBe("USD");
  });

  it("says it is loading until all four have answered, and holds no rows meanwhile", () => {
    mocks.answers = {
      ArEventTasks: done([taskRow]),
      PaymentHistory: { data: undefined, isLoading: true, error: undefined },
    };

    expect(drawn()).toMatchObject({ rows: [], isLoading: true });
  });

  // The office currencies include an online-only fetch (QBO connections). The list is local-first:
  // it draws on the fallback currency and re-draws when the fetch lands, as the AR tabs do.
  it("does not wait for the office currencies", () => {
    mocks.answers = { ArEventTasks: done([taskRow]) };
    mocks.officesLoading = true;

    expect(drawn()).toMatchObject({ isLoading: false });
    expect(drawn().rows).toHaveLength(1);
  });

  it("passes on the first error", () => {
    mocks.answers = {
      EventLineItems: { data: undefined, isLoading: false, error: new Error("disk full") },
    };

    expect(drawn().error).toBe("disk full");
  });
});
