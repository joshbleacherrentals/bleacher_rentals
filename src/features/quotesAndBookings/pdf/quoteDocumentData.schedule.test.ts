import { beforeEach, expect, it, vi } from "vitest";
const { tables, errors } = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  errors: {} as Record<string, unknown>,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = () => ({ data: tables[table] ?? [], error: errors[table] ?? null });
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (r: unknown) => void) => resolve(result()),
      };
      return chain;
    },
  }),
}));
import { buildQuoteDocumentData } from "./quoteDocumentData";
beforeEach(() => {
  Object.keys(errors).forEach((key) => delete errors[key]);
  tables.Events = {
    id: "event",
    event_name: "Quote",
    tax_percent: 0,
    tax_amount_cents: 0,
    sales_office_uuid: null,
  };
  tables.EventLineItems = [{ header: "Rental", quantity: 1, value_cents: 100000, currency: "USD" }];
  tables.PaymentInstallments = [
    { id: "a", due_date: "2026-01-01", percentage_bps: 5000 },
    { id: "b", due_date: "2026-02-01", percentage_bps: 5000 },
  ];
  tables.PaymentHistory = [
    {
      id: "paid",
      installment_id: "a",
      amount_cents: 50000,
      currency: "USD",
      status: "succeeded",
      paid_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
});
it("PDF/public document derives dollars and payment status from the current price", async () => {
  const before = await buildQuoteDocumentData("event", "https://example.com");
  expect(before?.paymentSchedule[0]).toMatchObject({
    amountCents: 50000,
    allocatedCents: 50000,
    status: "paid",
  });
  tables.EventLineItems = [{ header: "Rental", quantity: 1, value_cents: 200000, currency: "USD" }];
  const after = await buildQuoteDocumentData("event", "https://example.com");
  expect(after?.paymentSchedule[0]).toMatchObject({
    amountCents: 100000,
    allocatedCents: 50000,
    status: "partial",
  });
  expect(after?.paymentSchedule[1].amountCents).toBe(100000);
});
it("does not turn a failed schedule read into an empty public document", async () => {
  errors.PaymentInstallments = { message: "read failed" };
  await expect(buildQuoteDocumentData("event", "https://example.com")).rejects.toThrow(
    "Could not load quote payment data",
  );
});
