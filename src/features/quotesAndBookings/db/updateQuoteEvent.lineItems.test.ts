import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuoteState } from "../state/useCreateQuoteStore";

// Spec: docs/specs/quote-detail-04-line-items-local.md §3 and §7 (test 3).
//
// Step 5 of `updateQuoteEvent` used to delete and re-insert the line items through Supabase. It
// now hands them to `syncEventLineItems`. What is checked here is that wiring: which call, with
// what, in which order, and that nothing of it goes to Supabase any more. The statements the sync
// itself writes are tested in `eventLineItems.test.ts`.

const mocks = vi.hoisted(() => ({
  syncEventLineItems: vi.fn(),
  logEventChanges: vi.fn(),
  logLineItemChanges: vi.fn(),
  syncPaymentInstallments: vi.fn(),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const kysely = await import("kysely");
  return {
    db: new kysely.Kysely({
      dialect: {
        createAdapter: () => new kysely.SqliteAdapter(),
        createDriver: () => new kysely.DummyDriver(),
        createIntrospector: (db) => new kysely.SqliteIntrospector(db),
        createQueryCompiler: () => new kysely.SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedExecute: vi.fn(async () => undefined),
  // The old event row, then the old line items.
  typedGetAll: vi.fn(async (compiled: { sql: string }) =>
    compiled.sql.includes('from "EventLineItems"')
      ? [{ header: "15 Row", quantity: 2, value_cents: 50000, currency: "USD" }]
      : [{ event_name: "Old name", event_status: "quoted" }],
  ),
}));
vi.mock("./eventLineItems", () => ({ syncEventLineItems: mocks.syncEventLineItems }));
vi.mock("./logEventChanges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./logEventChanges")>()),
  logEventChanges: mocks.logEventChanges,
  logLineItemChanges: mocks.logLineItemChanges,
}));
vi.mock("./paymentInstallments", () => ({
  syncPaymentInstallments: mocks.syncPaymentInstallments,
}));
vi.mock("../utils/resolvePaymentSchedule", () => ({ validatePaymentSchedule: () => null }));
vi.mock("../utils/notifyFinanceBooked", () => ({
  postFinanceBookedNotice: vi.fn(),
  shouldNotifyFinanceBooked: () => false,
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));

import { updateQuoteEvent } from "./updateQuoteEvent";

const lineItems = [
  {
    id: "li-1",
    category: "bleachers",
    label: "15 Row",
    bleacherTypeUuid: "bt-15",
    qty: 2,
    unitPriceCents: 50000,
    lineTotalCents: 100000,
    overridePrice: false,
    discountType: "percentage",
    discountValue: 0,
    description: null,
  },
];

const state = {
  eventName: "New name",
  status: "quoted",
  currency: "USD",
  lineItems,
  paymentInstallments: [],
  scheduleError: null,
  taxPercent: 0,
  taxOverrideCents: null,
  venueId: null,
  eventAddressData: null,
} as unknown as CreateQuoteState;

const supabase = { from: vi.fn() };
const save = () => updateQuoteEvent("ev-1", state, supabase as never, "user-1");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncEventLineItems.mockResolvedValue(undefined);
  mocks.logEventChanges.mockResolvedValue(undefined);
  mocks.logLineItemChanges.mockResolvedValue(undefined);
  mocks.syncPaymentInstallments.mockResolvedValue(undefined);
});

describe("updateQuoteEvent: the line items step", () => {
  it("hands the form's line items and currency to the local sync", async () => {
    await save();
    expect(mocks.syncEventLineItems).toHaveBeenCalledTimes(1);
    expect(mocks.syncEventLineItems).toHaveBeenCalledWith("ev-1", lineItems, "USD");
  });

  it("sends nothing about line items to Supabase", async () => {
    await save();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("runs after the change log and before the payment schedule, as the old step did", async () => {
    await save();
    const order = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];
    expect(order(mocks.logLineItemChanges)).toBeLessThan(order(mocks.syncEventLineItems));
    expect(order(mocks.syncEventLineItems)).toBeLessThan(order(mocks.syncPaymentInstallments));
  });

  it("lets a failed sync reach the caller, so the editor keeps the draft, and goes no further", async () => {
    mocks.syncEventLineItems.mockRejectedValue(new Error("write refused"));
    await expect(save()).rejects.toThrow("write refused");
    expect(mocks.syncPaymentInstallments).not.toHaveBeenCalled();
  });
});
