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
  paymentInstallments: [{ id: "inst-1", dueDate: "2026-09-01", percentageBps: 10000 }],
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

  it("saves a quote whose schedule is a single full payment", async () => {
    await createQuoteEvent(state, supabase, "user-1");

    expect(syncPaymentInstallments).toHaveBeenCalledWith(
      expect.any(String),
      [{ id: "inst-1", dueDate: "2026-09-01", percentageBps: 10000 }],
      "USD",
    );
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
