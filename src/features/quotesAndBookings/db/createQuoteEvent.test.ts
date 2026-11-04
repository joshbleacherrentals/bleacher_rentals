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

const state = {
  eventName: "Homecoming",
  eventStart: "2026-09-12",
  eventEnd: "2026-09-13",
  status: "draft",
  lineItems: [],
  taxPercent: 0,
  taxOverrideCents: null,
  scheduleError: null,
  paymentInstallments: [],
  currency: "USD",
  venueId: null,
  eventAddressData: null,
} as never;

const rpc = vi.fn();
const supabase = { rpc } as never;

beforeEach(() => {
  executed.length = 0;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 123456789, error: null });
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
