import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

// Spec: docs/specs/invoice-number-01-assign-in-database.md §4, §7. The invoice number is given by
// the database when the Events row is uploaded (trigger), so creating a quote on the screen no
// longer asks for one and no longer writes it back. `db` and the typed helpers are fakes that
// record the compiled SQL (as in eventTypes.test.ts).

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: <T>() => undefined as unknown as T,
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
}));

vi.mock("./paymentInstallments", () => ({ syncPaymentInstallments: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));

import { createQuoteEvent } from "./createQuoteEvent";
import { syncPaymentInstallments } from "./paymentInstallments";

const baseState = {
  eventName: "Homecoming",
  eventStart: "2026-09-12",
  eventEnd: "2026-09-13",
  status: "draft",
  lineItems: [],
  taxPercent: 0,
  taxOverrideCents: null,
  scheduleError: null,
  paymentInstallments: [{ id: "inst-1", dueDate: "", percentageBps: 10000, dueOnSigning: true }],
  currency: "USD",
  venueId: null,
  eventAddressData: null,
};
const state = baseState as never;

const rpc = vi.fn();
const supabase = { rpc } as never;

beforeEach(() => {
  executed.length = 0;
  vi.mocked(syncPaymentInstallments).mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 123456789, error: null });
});

describe("createQuoteEvent — the payment schedule", () => {
  it("refuses to save a quote with no schedule, whatever its status, and writes nothing", async () => {
    for (const status of ["draft", "quoted"]) {
      const noSchedule = { ...baseState, status, paymentInstallments: [] } as never;

      await expect(createQuoteEvent(noSchedule, supabase, "user-1")).rejects.toThrow(
        "Add a payment schedule before saving.",
      );
    }

    expect(executed).toHaveLength(0);
    expect(syncPaymentInstallments).not.toHaveBeenCalled();
  });

  it("refuses a schedule whose first installment is not due on signing, and writes nothing", async () => {
    const dated = {
      ...baseState,
      paymentInstallments: [{ id: "inst-1", dueDate: "2026-09-01", percentageBps: 10000 }],
    } as never;

    await expect(createQuoteEvent(dated, supabase, "user-1")).rejects.toThrow(
      "The first installment is always due on signing.",
    );

    expect(executed).toHaveLength(0);
    expect(syncPaymentInstallments).not.toHaveBeenCalled();
  });

  it("saves a quote whose schedule is a single full payment", async () => {
    await createQuoteEvent(state, supabase, "user-1");

    expect(syncPaymentInstallments).toHaveBeenCalledWith(
      expect.any(String),
      [{ id: expect.any(String), dueDate: "", percentageBps: 10000, dueOnSigning: true }],
      "USD",
    );
  });
});

// A saved draft (`create-quote-draft` in localStorage) carries its installment ids. Two tabs can
// load the same draft, so the second Save met the ids the first one had taken and failed on the
// unique key of PaymentInstallments — after the Events row was already written.
describe("createQuoteEvent — a stale draft", () => {
  const twoInstallments = {
    ...baseState,
    paymentInstallments: [
      { id: "draft-inst-1", dueDate: "", percentageBps: 5000, dueOnSigning: true },
      { id: "draft-inst-2", dueDate: "2026-09-01", percentageBps: 5000 },
    ],
  } as never;

  it("gives every installment a fresh id, keeping everything else the draft says", async () => {
    await createQuoteEvent(twoInstallments, supabase, "user-1");

    const written = vi.mocked(syncPaymentInstallments).mock.calls[0][1];
    expect(written.map((i) => i.id)).not.toContain("draft-inst-1");
    expect(written.map((i) => i.id)).not.toContain("draft-inst-2");
    expect(new Set(written.map((i) => i.id)).size).toBe(2);
    expect(written.map(({ id: _id, ...rest }) => rest)).toEqual([
      { dueDate: "", percentageBps: 5000, dueOnSigning: true },
      { dueDate: "2026-09-01", percentageBps: 5000 },
    ]);
  });

  it("uses different ids each time the same draft is saved", async () => {
    await createQuoteEvent(twoInstallments, supabase, "user-1");
    await createQuoteEvent(twoInstallments, supabase, "user-1");

    const [first, second] = vi.mocked(syncPaymentInstallments).mock.calls.map((c) => c[1]);
    const firstIds = new Set(first.map((i) => i.id));
    expect(second.some((i) => firstIds.has(i.id))).toBe(false);
  });

  it("does not change the draft it was given", async () => {
    await createQuoteEvent(twoInstallments, supabase, "user-1");

    expect(
      (twoInstallments as unknown as typeof baseState).paymentInstallments.map((i) => i.id),
    ).toEqual(["draft-inst-1", "draft-inst-2"]);
  });
});

// If anything after the Events insert fails, the row exists. The screen has to know its id, or
// every further Save inserts another quote.
describe("createQuoteEvent — telling the screen the event exists", () => {
  it("reports the new event id right after the Events row is inserted, before anything else", async () => {
    const order: string[] = [];
    const onEventInserted = vi.fn((_eventId: string) => {
      order.push("reported");
    });
    vi.mocked(syncPaymentInstallments).mockImplementationOnce(async () => {
      order.push("installments");
    });
    const withLineItem = {
      ...baseState,
      lineItems: [
        {
          id: "li-1",
          category: "custom",
          label: "Delivery",
          qty: 1,
          unitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
    } as never;

    const eventId = await createQuoteEvent(withLineItem, supabase, "user-1", onEventInserted);

    expect(onEventInserted).toHaveBeenCalledTimes(1);
    expect(onEventInserted).toHaveBeenCalledWith(eventId);
    const eventsInsert = executed.findIndex((q) => q.sql.startsWith('insert into "Events"'));
    const lineItemInsert = executed.findIndex((q) =>
      q.sql.startsWith('insert into "EventLineItems"'),
    );
    expect(eventsInsert).toBeGreaterThanOrEqual(0);
    expect(lineItemInsert).toBeGreaterThan(eventsInsert);
    expect(order).toEqual(["reported", "installments"]);
  });

  it("has already reported the id when a later step fails", async () => {
    const onEventInserted = vi.fn();
    vi.mocked(syncPaymentInstallments).mockRejectedValueOnce(new Error("UNIQUE constraint failed"));

    await expect(createQuoteEvent(state, supabase, "user-1", onEventInserted)).rejects.toThrow(
      "UNIQUE constraint failed",
    );

    expect(onEventInserted).toHaveBeenCalledTimes(1);
    const insertedId = (
      executed.find((q) => q.sql.startsWith('insert into "Events"'))!.parameters as unknown[]
    )[0];
    expect(onEventInserted).toHaveBeenCalledWith(insertedId);
  });

  it("does not report anything when the event row itself is never written", async () => {
    const onEventInserted = vi.fn();
    const noSchedule = { ...baseState, paymentInstallments: [] } as never;

    await expect(
      createQuoteEvent(noSchedule, supabase, "user-1", onEventInserted),
    ).rejects.toThrow();

    expect(onEventInserted).not.toHaveBeenCalled();
  });

  it("still works when the caller passes no callback", async () => {
    await expect(createQuoteEvent(state, supabase, "user-1")).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("createQuoteEvent — the invoice number", () => {
  it("inserts the Events row and returns its id", async () => {
    const id = await createQuoteEvent(state, supabase, "user-1");

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(executed.filter((q) => q.sql.startsWith('insert into "Events"'))).toHaveLength(1);
  });

  it("does not ask the database for a number: the row gets it from the trigger when it uploads", async () => {
    await createQuoteEvent(state, supabase, "user-1");

    expect(rpc).not.toHaveBeenCalled();
  });

  it("writes no invoice_number, neither in the insert nor in a later update", async () => {
    await createQuoteEvent(state, supabase, "user-1");

    expect(executed.some((q) => q.sql.startsWith('update "Events"'))).toBe(false);
    expect(executed.some((q) => q.sql.includes("invoice_number"))).toBe(false);
  });
});
