import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuoteState } from "../state/useCreateQuoteStore";

// A quote cannot be saved without a payment schedule, on an edit as on a new quote, and for a
// draft as for a quoted one. The real validator runs here (the other updateQuoteEvent tests stub
// it); the refusal happens before anything is written.

const mocks = vi.hoisted(() => ({
  syncEventLineItems: vi.fn(),
  syncPaymentInstallments: vi.fn(),
  typedExecute: vi.fn(async () => undefined),
  logEventChanges: vi.fn(),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const kysely = await import("kysely");
  return {
    db: new kysely.Kysely({
      dialect: {
        createAdapter: () => new kysely.SqliteAdapter(),
        createDriver: () => new kysely.DummyDriver(),
        createIntrospector: (d) => new kysely.SqliteIntrospector(d),
        createQueryCompiler: () => new kysely.SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedExecute: mocks.typedExecute,
  typedGetAll: vi.fn(async (compiled: { sql: string }) =>
    compiled.sql.includes('from "EventLineItems"')
      ? []
      : [{ event_name: "Old name", event_status: "quoted" }],
  ),
}));
vi.mock("./eventLineItems", () => ({ syncEventLineItems: mocks.syncEventLineItems }));
vi.mock("./logEventChanges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./logEventChanges")>()),
  logEventChanges: mocks.logEventChanges,
  logLineItemChanges: vi.fn(),
}));
vi.mock("./paymentInstallments", () => ({
  syncPaymentInstallments: mocks.syncPaymentInstallments,
}));
vi.mock("../utils/notifyFinanceBooked", () => ({
  postFinanceBookedNotice: vi.fn(),
  shouldNotifyFinanceBooked: () => false,
}));
vi.mock("../utils/requestInvoiceCheck", () => ({ requestInvoiceCheck: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));

import { updateQuoteEvent } from "./updateQuoteEvent";

const stateWith = (status: string, paymentInstallments: unknown[]) =>
  ({
    eventName: "New name",
    status,
    currency: "USD",
    lineItems: [],
    paymentInstallments,
    scheduleError: null,
    taxPercent: 0,
    taxOverrideCents: null,
    venueId: null,
    eventAddressData: null,
  }) as unknown as CreateQuoteState;

const supabase = { from: vi.fn() };
const save = (state: CreateQuoteState) =>
  updateQuoteEvent("ev-1", state, supabase as never, "user-1");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateQuoteEvent: the payment schedule", () => {
  it("refuses to save a quote with no schedule, draft or quoted, and writes nothing", async () => {
    for (const status of ["draft", "quoted"]) {
      await expect(save(stateWith(status, []))).rejects.toThrow(
        "Add a payment schedule before saving.",
      );
    }

    expect(mocks.typedExecute).not.toHaveBeenCalled();
    expect(mocks.syncEventLineItems).not.toHaveBeenCalled();
    expect(mocks.syncPaymentInstallments).not.toHaveBeenCalled();
  });

  it("saves a quote whose schedule is a single full payment", async () => {
    const full = [{ id: "inst-1", dueDate: "2026-09-01", percentageBps: 10000 }];

    await save(stateWith("quoted", full));

    expect(mocks.syncPaymentInstallments).toHaveBeenCalledWith("ev-1", full, "USD");
  });
});
