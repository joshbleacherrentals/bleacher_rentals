import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuoteState } from "../state/useCreateQuoteStore";

// Spec: docs/specs/qbo-invoice-06a-check-on-save.md §4 and §8. The last thing a Save does, beside the
// booked notice, is ask for the quote's invoice to be checked. What is checked here is that wiring:
// when, how often, and that a save that fails never gets there. What the request does is tested in
// `requestInvoiceCheck.test.ts`.

const mocks = vi.hoisted(() => ({
  syncEventLineItems: vi.fn(),
  logEventChanges: vi.fn(),
  logLineItemChanges: vi.fn(),
  syncPaymentInstallments: vi.fn(),
  requestInvoiceCheck: vi.fn(),
  postFinanceBookedNotice: vi.fn(),
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
  typedExecute: vi.fn(async () => undefined),
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
  logLineItemChanges: mocks.logLineItemChanges,
}));
vi.mock("./paymentInstallments", () => ({
  syncPaymentInstallments: mocks.syncPaymentInstallments,
}));
vi.mock("../utils/resolvePaymentSchedule", () => ({ validatePaymentSchedule: () => null }));
vi.mock("../utils/notifyFinanceBooked", () => ({
  postFinanceBookedNotice: mocks.postFinanceBookedNotice,
  shouldNotifyFinanceBooked: () => false,
}));
vi.mock("../utils/requestInvoiceCheck", () => ({
  requestInvoiceCheck: mocks.requestInvoiceCheck,
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));

import { updateQuoteEvent } from "./updateQuoteEvent";

const state = {
  eventName: "New name",
  status: "quoted",
  currency: "USD",
  lineItems: [],
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
  mocks.requestInvoiceCheck.mockResolvedValue(undefined);
});

describe("updateQuoteEvent: the invoice check after a Save", () => {
  it("asks for the quote's invoice to be checked, once, for the quote that was saved", async () => {
    await save();

    expect(mocks.requestInvoiceCheck).toHaveBeenCalledTimes(1);
    expect(mocks.requestInvoiceCheck).toHaveBeenCalledWith("ev-1");
  });

  it("does so after every write, the payment schedule last of them", async () => {
    await save();

    const order = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];
    expect(order(mocks.syncEventLineItems)).toBeLessThan(order(mocks.requestInvoiceCheck));
    expect(order(mocks.syncPaymentInstallments)).toBeLessThan(order(mocks.requestInvoiceCheck));
  });

  it("does not wait for it: the save is over before the check answers", async () => {
    let finished = false;
    mocks.requestInvoiceCheck.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 50),
        ),
    );

    await save();

    expect(finished).toBe(false);
  });

  it("is not reached when a write fails: the caller gets the error, and no check is asked for", async () => {
    mocks.syncPaymentInstallments.mockRejectedValue(new Error("write refused"));

    await expect(save()).rejects.toThrow("write refused");

    expect(mocks.requestInvoiceCheck).not.toHaveBeenCalled();
  });

  it("is not reached when the line items fail either", async () => {
    mocks.syncEventLineItems.mockRejectedValue(new Error("write refused"));

    await expect(save()).rejects.toThrow("write refused");

    expect(mocks.requestInvoiceCheck).not.toHaveBeenCalled();
  });
});
