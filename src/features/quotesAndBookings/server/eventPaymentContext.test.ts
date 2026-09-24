import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { loadEventPaymentContext } from "./eventPaymentContext";

type TableValue = Record<string, unknown> | Record<string, unknown>[] | null | undefined;

/**
 * Table-aware fake: `from(t).select().eq()...` resolves whatever `tables[t]`
 * holds — an object for `.single()` reads, an array for list reads.
 */
function fakeSupabase(tables: Record<string, TableValue>): SupabaseClient<Database> {
  const from = (table: string) => {
    const value = tables[table];
    const one = () =>
      Promise.resolve({
        data: (Array.isArray(value) ? (value[0] ?? null) : (value ?? null)) as any,
        error: null,
      });
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      single: one,
      maybeSingle: one,
      then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: Array.isArray(value) ? value : value ? [value] : [], error: null }),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

/** An event priced at $200 + 10% tax, sold out of a USD office. */
function seed(over: Record<string, TableValue> = {}): Record<string, TableValue> {
  return {
    Events: { sales_office_uuid: "office-1", tax_percent: 10, tax_amount_cents: null },
    SalesOffices: { quickbook_uuid: "qbo-1", address_uuid: "addr-1" },
    QboConnections: { currency: "USD" },
    Addresses: { state_province: "Florida" },
    EventLineItems: [{ quantity: 2, value_cents: 10000 }],
    PaymentInstallments: [],
    PaymentHistory: [],
    ...over,
  };
}

const payment = (over: Record<string, unknown> = {}) => ({
  id: "pay-1",
  installment_id: null,
  amount_cents: 5000,
  currency: "USD",
  status: "succeeded",
  paid_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

describe("loadEventPaymentContext", () => {
  it("returns null when the event does not exist", async () => {
    const ctx = await loadEventPaymentContext(fakeSupabase(seed({ Events: null })), "evt-missing");
    expect(ctx).toBeNull();
  });

  it("takes the currency from the office's QuickBooks connection, not the line items", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(
        seed({
          QboConnections: { currency: "CAD" },
          EventLineItems: [{ quantity: 1, value_cents: 10000, currency: "USD" }],
        }),
      ),
      "evt-1",
    );
    expect(ctx?.currency).toBe("CAD");
  });

  it("falls back to the office province when the QBO connection reports no currency", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(
        seed({ QboConnections: { currency: null }, Addresses: { state_province: "Ontario" } }),
      ),
      "evt-1",
    );
    expect(ctx?.currency).toBe("CAD");
  });

  it("falls back to USD when the event has no sales office at all", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(
        seed({ Events: { sales_office_uuid: null, tax_percent: 0, tax_amount_cents: null } }),
      ),
      "evt-1",
    );
    expect(ctx?.currency).toBe("USD");
  });

  it("totals line items plus tax and subtracts the money actually received", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(seed({ PaymentHistory: [payment({ amount_cents: 5000 })] })),
      "evt-1",
    );
    expect(ctx?.totalCents).toBe(22000);
    expect(ctx?.paidCents).toBe(5000);
    expect(ctx?.remainingCents).toBe(17000);
  });

  it("counts negative line items as discounts before tax", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(
        seed({
          EventLineItems: [
            { quantity: 2, value_cents: 10000 },
            { quantity: 1, value_cents: -5000 },
          ],
        }),
      ),
      "evt-1",
    );
    // (20000 - 5000) * 1.10
    expect(ctx?.totalCents).toBe(16500);
  });

  it("prefers a stored tax amount over the percentage", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(
        seed({ Events: { sales_office_uuid: "office-1", tax_percent: 10, tax_amount_cents: 1 } }),
      ),
      "evt-1",
    );
    expect(ctx?.totalCents).toBe(20001);
  });

  it("ignores payments in another currency — they never reduce this balance", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(seed({ PaymentHistory: [payment({ currency: "CAD", amount_cents: 5000 })] })),
      "evt-1",
    );
    expect(ctx?.paidCents).toBe(0);
    expect(ctx?.remainingCents).toBe(22000);
  });

  it("ignores payments that did not succeed", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(seed({ PaymentHistory: [payment({ status: "pending" })] })),
      "evt-1",
    );
    expect(ctx?.remainingCents).toBe(22000);
  });

  it("never reports a negative balance when the client overpaid", async () => {
    const ctx = await loadEventPaymentContext(
      fakeSupabase(seed({ PaymentHistory: [payment({ amount_cents: 99000 })] })),
      "evt-1",
    );
    expect(ctx?.remainingCents).toBe(0);
  });
});

it("uses current taxed price with percentage terms while preserving received payments", async () => {
  const terms = [
    { id: "i1", due_date: "2026-01-01", percentage_bps: 5000 },
    { id: "i2", due_date: "2026-02-01", percentage_bps: 5000 },
  ];
  const tables = seed({
    PaymentInstallments: terms,
    PaymentHistory: [payment({ installment_id: "i1", amount_cents: 11000 })],
  });
  expect(await loadEventPaymentContext(fakeSupabase(tables), "evt-1")).toMatchObject({
    totalCents: 22000,
    paidCents: 11000,
    remainingCents: 11000,
  });
  tables.EventLineItems = [{ quantity: 2, value_cents: 20000 }];
  expect(await loadEventPaymentContext(fakeSupabase(tables), "evt-1")).toMatchObject({
    totalCents: 44000,
    paidCents: 11000,
    remainingCents: 33000,
  });
});
