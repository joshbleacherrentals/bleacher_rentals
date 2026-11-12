import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Spec: docs/specs/accountant-collections-08-invoice-data.md §3 and §4. The hook is rendered on
// the server with `useTypedQuery` replaced: what is under test is the questions it asks the
// local database and how it turns the answers into the page's data.

type Compiled = { sql: string; parameters: unknown[] };
type Answer = {
  data: unknown[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | undefined;
};

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

/** Which question a compiled query is. Several tables are asked about more than once. */
function which(sql: string): string {
  const table = /\bfrom "(\w+)"/.exec(sql)?.[1] ?? "";
  switch (table) {
    case "Events":
      return sql.includes('"event_name"') ? "event" : "eventOffice";
    case "Contacts":
      if (sql.includes('"Companies"')) return "contactCompanies";
      return sql.includes("finance_contact_uuid") ? "financeContact" : "contact";
    case "Addresses":
      return sql.includes('"Venues"') ? "venueAddress" : "address";
    case "Venues":
      return "venue";
    case "Users":
      return sql.includes("created_by_user_uuid") ? "accountManager" : "userNames";
    default:
      return table;
  }
}

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: Compiled) => {
    mocks.compiled.push(compiled);
    return (
      mocks.answers[which(compiled.sql)] ?? {
        data: [],
        isLoading: false,
        isFetching: false,
        error: undefined,
      }
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

import { useInvoiceData } from "./useInvoiceData";

const done = (data: unknown[]): Answer => ({
  data,
  isLoading: false,
  isFetching: false,
  error: undefined,
});

const EVENT_ID = "ev-1";

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    invoice_number: 1042,
    event_name: "Fall Classic",
    event_status: "booked",
    event_start: "2027-06-01",
    event_end: "2027-06-03",
    event_type_uuid: "type-1",
    sales_office_uuid: "office-ca",
    tax_percent: 15,
    tax_amount_cents: null,
    booked_at: "2026-08-01T12:00:00+00:00",
    created_by_user_uuid: "user-1",
    deleted: 0,
    is_tax_overridden: 0,
    ...over,
  };
}

const installmentRows = [
  ["i-1", "2026-09-01"],
  ["i-2", "2026-10-01"],
  ["i-3", "2026-11-01"],
  ["i-4", "2026-12-01"],
].map(([id, due]) => ({ id, due_date: due, percentage_bps: 2500, currency: "CAD" }));

function paymentRow(over: Record<string, unknown> & { id: string; amount_cents: number }) {
  return {
    installment_id: null,
    currency: "CAD",
    status: "succeeded",
    payment_method_type: "check",
    payer_name: "Acme Ltd",
    payer_email: null,
    notes: null,
    stripe_receipt_url: null,
    paid_at: "2026-09-03T18:30:00+00:00",
    created_at: "2026-09-03T18:30:00+00:00",
    intended_installment_id: null,
    entry_source: "manual",
    recorded_by_user_uuid: "user-1",
    reference: null,
    deleted_at: null,
    deleted_by_user_uuid: null,
    delete_reason: null,
    ...over,
  };
}

const paymentRows = [
  paymentRow({ id: "p-stripe", amount_cents: 323_575, entry_source: "stripe" }),
  paymentRow({ id: "p-check", amount_cents: 150_000, paid_at: "2026-10-05T15:00:00+00:00" }),
  paymentRow({
    id: "p-deleted",
    amount_cents: 50_000,
    paid_at: "2026-10-20T15:00:00+00:00",
    deleted_at: "2026-10-21T09:00:00+00:00",
  }),
];

function taskRow(over: Record<string, unknown> & { id: string }) {
  return {
    created_at: "2026-10-01T05:20:00.000Z",
    due_date: "2026-11-15",
    note: "Remind the customer about payment",
    completed: 0,
    finished_at: null,
    ...over,
  };
}

/** A booked CAD event in collections, with a venue, two contacts and a company. */
function setHappyPath() {
  mocks.currencies = new Map([["office-ca", "CAD"]]);
  mocks.answers = {
    event: done([eventRow()]),
    eventOffice: done([{ sales_office_uuid: "office-ca" }]),
    address: done([
      { id: "a-1", street: "1 Event Way", city: "Toronto", state_province: "ON", zip_postal: null },
    ]),
    venue: done([{ id: "v-1", name: "Maple Arena" }]),
    contact: done([
      { id: "c-1", first_name: "Ann", last_name: "Lee", email: "ann@example.com", phone: "555-1" },
    ]),
    financeContact: done([
      { id: "c-2", first_name: "Bob", last_name: "Ray", email: "bob@example.com", phone: null },
    ]),
    accountManager: done([{ id: "user-1", first_name: "Sam", last_name: "Lee" }]),
    contactCompanies: done([
      {
        contact_id: "c-1",
        company_id: "co-1",
        company_name: "Acme Ltd",
        company_phone: "555-9",
        company_email: "office@acme.example",
      },
      {
        contact_id: "c-2",
        company_id: null,
        company_name: null,
        company_phone: null,
        company_email: null,
      },
    ]),
    venueAddress: done([
      { street: "9 Arena Rd", city: "Ottawa", state_province: "ON", zip_postal: "K1A 0B1" },
    ]),
    ArEventTasks: done([
      taskRow({ id: "t-done", completed: 1, due_date: "2026-11-01" }),
      taskRow({ id: "t-open", due_date: "2026-11-17", note: "Call the accountant" }),
    ]),
    EventLineItems: done([{ line_total_cents: 1_125_478 }]),
    PaymentInstallments: done(installmentRows),
    PaymentHistory: done(paymentRows),
    userNames: done([{ id: "user-1", first_name: "Sam", last_name: "Lee" }]),
    EventTypes: done([{ name: "Festival" }]),
  };
}

function Probe() {
  const d = useInvoiceData(EVENT_ID);
  return (
    <p>
      {JSON.stringify({
        isLoading: d.isLoading,
        notFound: d.notFound,
        event: d.event,
        contacts: d.contacts,
        venue: d.venue,
        eventInfo: d.eventInfo,
        money: d.money,
        scheduleStatuses: d.schedule.map((r) => r.status),
        payments: d.payments.map((p) => [p.id, !!p.deletedAt]),
        allocationReceived: d.allocation.totalReceivedCents,
        staffNames: [...d.staffNames.entries()],
        tasks: d.tasks,
        currency: d.currency,
        today: d.today,
      })}
    </p>
  );
}

const drawn = () =>
  JSON.parse(
    renderToStaticMarkup(<Probe />)
      .replace(/<\/?p>/g, "")
      .replaceAll("&quot;", '"'),
  );

beforeEach(() => {
  mocks.compiled = [];
  mocks.answers = {};
  mocks.today = "2026-11-15";
  mocks.currencies = new Map();
  mocks.officesLoading = false;
});

describe("useInvoiceData: loading and not found", () => {
  it("says notFound for a missing event", () => {
    mocks.answers = { event: done([]) };

    const data = drawn();
    expect(data.notFound).toBe(true);
    expect(data.isLoading).toBe(false);
  });

  it("is loading, and not 'not found', while the event query has not answered", () => {
    setHappyPath();
    mocks.answers.event = { data: [], isLoading: true, isFetching: true, error: undefined };

    const data = drawn();
    expect(data.isLoading).toBe(true);
    expect(data.notFound).toBe(false);
  });

  it("stays loading until the office currency is resolved", () => {
    setHappyPath();
    mocks.officesLoading = true;

    const data = drawn();
    expect(data.isLoading).toBe(true);
    expect(data.notFound).toBe(false);
  });

  it("is loading while a narrow query has not answered", () => {
    setHappyPath();
    mocks.answers.PaymentHistory = {
      data: [],
      isLoading: true,
      isFetching: true,
      error: undefined,
    };

    expect(drawn().isLoading).toBe(true);
  });

  it("is done once everything has answered", () => {
    setHappyPath();

    const data = drawn();
    expect(data.isLoading).toBe(false);
    expect(data.notFound).toBe(false);
  });
});

describe("useInvoiceData: the queries", () => {
  // `useQuoteDetail` sets state while rendering, so the component renders twice and every query is
  // compiled twice: the distinct ones are what the screen asks.
  const asked = () => [...new Set(mocks.compiled.map((c) => c.sql))];

  // Spec 08 allowed 15 distinct queries; spec 20 adds two narrow ones (the active signatures and the
  // log rows that set the event to booked), so the budget is 17 and not one more.
  it("keeps the query count small: the 15 of spec 08 and the 2 of spec 20", () => {
    setHappyPath();
    drawn();

    expect(asked().length).toBeLessThanOrEqual(17);
  });

  it("reads only the rows of the event it is asked about", () => {
    setHappyPath();
    drawn();

    for (const name of [
      "ArEventTasks",
      "EventLineItems",
      "PaymentInstallments",
      "PaymentHistory",
    ]) {
      const query = mocks.compiled.find((c) => which(c.sql) === name)!;
      expect(query.parameters, name).toContain(EVENT_ID);
    }
  });

  // docs/specs/accountant-collections-19-task-delete.md §3 and §5.
  it("asks for the tasks that are not deleted (spec 19)", () => {
    setHappyPath();
    drawn();

    const { sql, parameters } = mocks.compiled.find((c) => which(c.sql) === "ArEventTasks")!;
    expect(sql).toMatch(/"deleted_at" is null/i);
    expect(sql).toMatch(/"event_uuid" = \?/);
    expect(parameters).toEqual([EVENT_ID]);
  });

  it("leaves deleted line items out of the sum", () => {
    setHappyPath();
    drawn();

    const { sql, parameters } = mocks.compiled.find((c) => which(c.sql) === "EventLineItems")!;
    expect(sql).toMatch(/sum\(/i);
    expect(sql).toContain('"deleted" = ?');
    expect(parameters).toContain(0);
  });

  it("reads the companies of both contacts in one query", () => {
    setHappyPath();
    drawn();

    expect(asked().filter((sql) => which(sql) === "contactCompanies")).toHaveLength(1);
  });
});

// docs/specs/accountant-collections-19-task-delete.md §3 and §5: the question the hook asks for the
// tasks is run on a real SQLite table, and the page is drawn from what it answers.
describe("useInvoiceData: a deleted task (spec 19)", () => {
  const TASK_SQL_ROWS = [
    // id, due_date, completed, note, finished_at, deleted_at
    ["t-kept", "2026-11-01", 1, "Kept", "2026-11-02T14:00:00.000Z", null],
    [
      "t-gone",
      "2026-11-05",
      1,
      "Deleted by mistake",
      "2026-11-06T14:00:00.000Z",
      "2026-11-07T09:00:00.000Z",
    ],
    ["t-open", "2026-11-17", 0, "Still open", null, null],
  ] as const;

  /** The tasks the hook's own query gives from a table that holds a deleted task. */
  function tasksFromTheLocalTable() {
    setHappyPath();
    drawn();
    const { sql, parameters } = mocks.compiled.find((c) => which(c.sql) === "ArEventTasks")!;

    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`create table "ArEventTasks" (id text primary key, created_at text, due_date text,
      completed integer, note text, event_uuid text, finished_at text, deleted_at text)`);
    const insert = sqlite.prepare(
      `insert into "ArEventTasks" values (?, '2026-10-01T05:20:00.000Z', ?, ?, ?, ?, ?, ?)`,
    );
    for (const [id, due, completed, note, finished, deleted] of TASK_SQL_ROWS) {
      insert.run(id, due, completed, note, EVENT_ID, finished, deleted);
    }
    // Another event's tasks, deleted or not, are never part of the answer.
    insert.run("t-other", "2026-11-01", 1, "Other event", "other", null, null);

    const rows = sqlite.prepare(sql).all(...(parameters as SQLInputValue[]));
    mocks.answers.ArEventTasks = done(rows);
    return drawn().tasks as {
      open: { id: string } | null;
      completed: { id: string }[];
    };
  }

  it("does not put a deleted task in tasks", () => {
    const tasks = tasksFromTheLocalTable();
    expect(tasks.completed.map((t) => t.id)).toEqual(["t-kept"]);
    expect(JSON.stringify(tasks)).not.toContain("Deleted by mistake");
  });

  it("keeps the open task and the tasks that were not deleted", () => {
    const tasks = tasksFromTheLocalTable();
    expect(tasks.open?.id).toBe("t-open");
    expect(tasks.completed).toHaveLength(1);
  });
});

// docs/specs/accountant-collections-20-signed-booked-line.md §3 and §5: the Signed / Booked line.
describe("useInvoiceData: the Signed / Booked line (spec 20)", () => {
  const signatureAnswer = (rows: { signer_name: string | null; signed_at: string | null }[]) =>
    done(rows);
  const logAnswer = (rows: { changed_by_user_uuid: string | null; changed_at: string }[]) =>
    done(rows);
  const ask = (name: string) => {
    setHappyPath();
    drawn();
    return mocks.compiled.find((c) => which(c.sql) === name)!;
  };

  it("asks for the active signatures of the event: signer and time only", () => {
    const { sql, parameters } = ask("ContractSignatures");

    expect(sql).toMatch(/^select "signer_name", "signed_at" from "ContractSignatures" where/i);
    expect(sql).toMatch(/"event_uuid" = \?/);
    expect(sql).toMatch(/"status" = \?/);
    expect(parameters).toEqual([EVENT_ID, "active"]);
  });

  it("asks for the event's status log rows that moved it to booked: manager and time only", () => {
    const { sql, parameters } = ask("EventChangeLog");

    expect(sql).toMatch(
      /^select "changed_by_user_uuid", "changed_at" from "EventChangeLog" where/i,
    );
    expect(sql).toMatch(/"event_uuid" = \?/);
    expect(sql).toMatch(/"field_name" = \?/);
    expect(sql).toMatch(/"next_value" = \?/);
    expect(parameters).toEqual([EVENT_ID, "event_status", "booked"]);
  });

  // The builder is given every matching row and picks the latest, so the queries carry no limit.
  it("reads every matching row: no limit, the builder picks the latest", () => {
    expect(ask("ContractSignatures").sql).not.toMatch(/limit/i);
    expect(ask("EventChangeLog").sql).not.toMatch(/limit/i);
  });

  describe("on a real SQLite table", () => {
    function runBoth() {
      setHappyPath();
      drawn();
      const signatures = mocks.compiled.find((c) => which(c.sql) === "ContractSignatures")!;
      const logs = mocks.compiled.find((c) => which(c.sql) === "EventChangeLog")!;

      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec(`create table "ContractSignatures" (id text primary key, event_uuid text,
        signer_name text, signed_at text, status text);
        create table "EventChangeLog" (id text primary key, event_uuid text, field_name text,
        prev_value text, next_value text, changed_by_user_uuid text, changed_at text)`);
      const sign = sqlite.prepare(`insert into "ContractSignatures" values (?, ?, ?, ?, ?)`);
      sign.run("s-active", EVENT_ID, "Dana Whitfield", "2026-10-22T19:14:00.000Z", "active");
      sign.run("s-old", EVENT_ID, "Old Signer", "2026-09-01T10:00:00.000Z", "invalidated");
      sign.run("s-other", "ev-other", "Other Signer", "2026-10-30T10:00:00.000Z", "active");
      const log = sqlite.prepare(`insert into "EventChangeLog" values (?, ?, ?, ?, ?, ?, ?)`);
      log.run(
        "l-booked",
        EVENT_ID,
        "event_status",
        "quoted",
        "booked",
        "user-7",
        "2026-11-03 14:15:00+00",
      );
      log.run(
        "l-lost",
        EVENT_ID,
        "event_status",
        "booked",
        "lost",
        "user-7",
        "2026-11-04 10:00:00+00",
      );
      log.run("l-field", EVENT_ID, "event_name", "A", "booked", "user-7", "2026-11-05 10:00:00+00");
      log.run(
        "l-other",
        "ev-other",
        "event_status",
        "quoted",
        "booked",
        "user-7",
        "2026-11-06 10:00:00+00",
      );

      return {
        signatures: sqlite
          .prepare(signatures.sql)
          .all(...(signatures.parameters as SQLInputValue[])),
        logs: sqlite.prepare(logs.sql).all(...(logs.parameters as SQLInputValue[])),
      };
    }

    it("does not return an invalidated signature or another event's", () => {
      expect(runBoth().signatures).toEqual([
        { signer_name: "Dana Whitfield", signed_at: "2026-10-22T19:14:00.000Z" },
      ]);
    });

    it("returns only the rows that set this event to booked", () => {
      expect(runBoth().logs).toEqual([
        { changed_by_user_uuid: "user-7", changed_at: "2026-11-03 14:15:00+00" },
      ]);
    });
  });

  it("is loading while either query has not answered", () => {
    for (const name of ["ContractSignatures", "EventChangeLog"]) {
      setHappyPath();
      mocks.answers[name] = { data: [], isLoading: true, isFetching: true, error: undefined };
      expect(drawn().isLoading, name).toBe(true);
    }
  });

  it("builds Signed from the signature rows", () => {
    setHappyPath();
    mocks.answers.ContractSignatures = signatureAnswer([
      { signer_name: "Dana Whitfield", signed_at: "2026-10-22T19:14:00.000Z" },
    ]);

    expect(drawn().event.signedLine).toEqual({
      label: "Signed",
      text: "Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield",
    });
  });

  it("builds Booked from the log row, with the manager's name from the staff names", () => {
    setHappyPath();
    mocks.answers.EventChangeLog = logAnswer([
      { changed_by_user_uuid: "user-1", changed_at: "2026-11-03T14:15:00.000Z" },
    ]);

    expect(drawn().event.signedLine).toEqual({
      label: "Booked",
      text: "Nov 3, 2026 at 9:15 AM EST by Sam Lee",
    });
  });

  it("builds Signed when both kinds of row exist", () => {
    setHappyPath();
    mocks.answers.ContractSignatures = signatureAnswer([
      { signer_name: "Dana Whitfield", signed_at: "2026-10-22T19:14:00.000Z" },
    ]);
    mocks.answers.EventChangeLog = logAnswer([
      { changed_by_user_uuid: "user-1", changed_at: "2026-11-03T14:15:00.000Z" },
    ]);

    expect(drawn().event.signedLine.label).toBe("Signed");
  });

  it("has no line for an event that is not booked and has no signature", () => {
    setHappyPath();
    mocks.answers.event = done([eventRow({ event_status: "quoted" })]);
    mocks.answers.EventChangeLog = logAnswer([
      { changed_by_user_uuid: "user-1", changed_at: "2026-11-03T14:15:00.000Z" },
    ]);

    expect(drawn().event.signedLine).toBeNull();
  });

  it("has no line for a booked event with no row and no booked_at", () => {
    setHappyPath();
    mocks.answers.event = done([eventRow({ booked_at: null })]);

    expect(drawn().event.signedLine).toBeNull();
  });

  it("treats a failed read of either query as no rows: the page still draws", () => {
    setHappyPath();
    const failed = {
      data: undefined as unknown as unknown[],
      isLoading: false,
      isFetching: false,
      error: new Error("read failed"),
    };
    mocks.answers.ContractSignatures = failed;
    mocks.answers.EventChangeLog = failed;

    const data = drawn();
    expect(data.isLoading).toBe(false);
    expect(data.notFound).toBe(false);
    expect(data.event.signedLine).toEqual({ label: "Booked", text: "Aug 1, 2026 at 8:00 AM EDT" });
  });

  it("writes the time in the office's zone, not UTC's", () => {
    setHappyPath();
    // 03:30 UTC on the 23rd is 23:30 on the 22nd in Toronto (EDT).
    mocks.answers.ContractSignatures = signatureAnswer([
      { signer_name: "Dana Whitfield", signed_at: "2026-10-23T03:30:00.000Z" },
    ]);

    expect(drawn().event.signedLine.text).toBe("Oct 22, 2026 at 11:30 PM EDT by Dana Whitfield");
  });
});

describe("useInvoiceData: the page's data", () => {
  it("builds the header: name, number, status, days overdue and account manager", () => {
    setHappyPath();

    expect(drawn().event).toEqual({
      name: "Fall Classic",
      invoiceNumber: 1042,
      status: "collections",
      daysOverdue: 45,
      accountManager: "Sam Lee",
      // No signature and no booked log row: the booked_at of the event, with no name (spec 20).
      signedLine: { label: "Booked", text: "Aug 1, 2026 at 8:00 AM EDT" },
    });
  });

  it("builds the money lines from the twin, in the office's currency", () => {
    setHappyPath();

    const data = drawn();
    expect(data.currency).toBe("CAD");
    expect(data.today).toBe("2026-11-15");
    expect(data.money).toEqual({
      contractSubtotalCents: 1_125_478,
      taxesLabel: "Taxes (15%)",
      taxesCents: 168_822,
      totalCents: 1_294_300,
      alreadyPaidCents: 473_575,
      remainingCents: 820_725,
      currentOverdueCents: 497_150,
    });
    expect(data.scheduleStatuses).toEqual(["Paid", "Partial", "Unpaid", "Unpaid"]);
  });

  it("gives every payment row, deleted ones too, while the money and Amount Due ignore it", () => {
    setHappyPath();

    const data = drawn();
    expect(data.payments).toEqual([
      ["p-stripe", false],
      ["p-check", false],
      ["p-deleted", true],
    ]);
    expect(data.allocationReceived).toBe(473_575);
    expect(data.money.alreadyPaidCents).toBe(473_575);
    expect(data.money.currentOverdueCents).toBe(497_150);
  });

  it("hands over the staff names for the payment dialog", () => {
    setHappyPath();

    expect(drawn().staffNames).toEqual([["user-1", "Sam Lee"]]);
  });

  it("builds the two contact cards, the finance contact without a company", () => {
    setHappyPath();

    expect(drawn().contacts).toEqual({
      contact: {
        name: "Ann Lee",
        phone: "555-1",
        email: "ann@example.com",
        company: { name: "Acme Ltd", phone: "555-9", email: "office@acme.example" },
      },
      financeContact: { name: "Bob Ray", phone: null, email: "bob@example.com", company: null },
    });
  });

  it("leaves the finance contact card out when the event has none", () => {
    setHappyPath();
    mocks.answers.financeContact = done([]);

    expect(drawn().contacts.financeContact).toBeNull();
  });

  it("shows the venue's name and address, and the event's dates and type", () => {
    setHappyPath();

    const data = drawn();
    expect(data.venue).toEqual({ name: "Maple Arena", address: "9 Arena Rd, Ottawa, ON K1A 0B1" });
    expect(data.eventInfo).toEqual({ start: "2027-06-01", end: "2027-06-03", type: "Festival" });
  });

  it("shows the event's own address and no venue name when there is no venue", () => {
    setHappyPath();
    mocks.answers.venue = done([]);
    mocks.answers.venueAddress = done([]);

    expect(drawn().venue).toEqual({ name: null, address: "1 Event Way, Toronto, ON" });
  });

  it("puts the open task apart from the completed ones", () => {
    setHappyPath();

    const { tasks } = drawn();
    expect(tasks.open).toMatchObject({ id: "t-open", note: "Call the accountant" });
    expect(tasks.completed.map((t: { id: string }) => t.id)).toEqual(["t-done"]);
  });

  // docs/specs/accountant-collections-18-task-finished-at.md §3 and §5.
  it("asks for finished_at with the tasks", () => {
    setHappyPath();
    drawn();

    const { sql } = mocks.compiled.find((c) => which(c.sql) === "ArEventTasks")!;
    expect(sql).toContain('"finished_at"');
  });

  it("passes the finish time through as a date in the office's time zone", () => {
    setHappyPath();
    mocks.answers.ArEventTasks = done([
      // 03:30 UTC on the 10th is 22:30 of the 9th in Toronto.
      taskRow({ id: "t-done", completed: 1, finished_at: "2026-11-10T03:30:00.000Z" }),
      taskRow({ id: "t-open", due_date: "2026-11-17" }),
    ]);

    const { tasks } = drawn();
    expect(tasks.completed[0].finishedLabel).toBe("09/11/2026");
    expect(tasks.open.finishedLabel).toBe("—");
  });

  it("takes the newest as the open task if two exist", () => {
    setHappyPath();
    mocks.answers.ArEventTasks = done([
      taskRow({ id: "t-a", created_at: "2026-10-01T05:20:00.000Z" }),
      taskRow({ id: "t-b", created_at: "2026-10-02T05:20:00.000Z" }),
    ]);

    expect(drawn().tasks.open.id).toBe("t-b");
  });

  it("has no account manager when the creator is unknown", () => {
    setHappyPath();
    mocks.answers.accountManager = done([]);

    expect(drawn().event.accountManager).toBeNull();
  });
});

describe("useInvoiceData: events in other states", () => {
  it("still shows a deleted event", () => {
    setHappyPath();
    mocks.answers.event = done([eventRow({ deleted: 1 })]);

    const data = drawn();
    expect(data.notFound).toBe(false);
    expect(data.event.name).toBe("Fall Classic");
    expect(data.event.status).toBe("collections");
  });

  it("shows Cancelled for a lost event", () => {
    setHappyPath();
    mocks.answers.event = done([eventRow({ event_status: "lost" })]);

    expect(drawn().event.status).toBe("cancelled");
  });

  it("shows Not active yet for a quote", () => {
    setHappyPath();
    mocks.answers.event = done([eventRow({ event_status: "quoted" })]);

    expect(drawn().event.status).toBe("not_active");
  });

  it("shows Paid when the whole total has been received", () => {
    setHappyPath();
    mocks.answers.PaymentHistory = done([
      paymentRow({ id: "p-all", amount_cents: 1_294_300, entry_source: "stripe" }),
    ]);

    const data = drawn();
    expect(data.event.status).toBe("paid");
    expect(data.money.remainingCents).toBe(0);
  });

  it("shows Schedule when nothing is overdue yet", () => {
    setHappyPath();
    mocks.answers.PaymentInstallments = done([
      { id: "i-1", due_date: "2026-12-01", percentage_bps: 10000, currency: "CAD" },
    ]);
    mocks.answers.PaymentHistory = done([]);

    const data = drawn();
    expect(data.event.status).toBe("schedule");
    expect(data.money.currentOverdueCents).toBe(0);
  });

  it("falls back to USD when the office currency is unknown", () => {
    setHappyPath();
    mocks.currencies = new Map();

    expect(drawn().currency).toBe("USD");
  });
});
