import { beforeEach, expect, it, vi } from "vitest";
const { tables, errors, calls } = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  errors: {} as Record<string, unknown>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = () => ({ data: tables[table] ?? [], error: errors[table] ?? null });
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ table, method, args });
          return chain;
        };
      const chain: any = {
        select: record("select"),
        eq: record("eq"),
        is: record("is"),
        order: record("order"),
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
  calls.length = 0;
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
      deleted_at: null,
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
// docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md (D1): the public page and the PDF
// never receive a deleted payment, so the query carries the filter — and a row that came back deleted
// anyway still does not count towards a status.
it("asks only for payments that are not deleted", async () => {
  await buildQuoteDocumentData("event", "https://example.com");

  const paymentCalls = calls.filter((c) => c.table === "PaymentHistory");
  expect(paymentCalls).toContainEqual({
    table: "PaymentHistory",
    method: "is",
    args: ["deleted_at", null],
  });
  expect(paymentCalls.find((c) => c.method === "select")?.args[0]).toContain("deleted_at");
});
it("does not count a payment that came back deleted anyway", async () => {
  (tables.PaymentHistory as Record<string, unknown>[])[0].deleted_at = "2026-01-02T00:00:00Z";

  const data = await buildQuoteDocumentData("event", "https://example.com");

  expect(data?.paymentSchedule[0]).toMatchObject({ allocatedCents: 0, status: "unpaid" });
});
it("does not turn a failed schedule read into an empty public document", async () => {
  errors.PaymentInstallments = { message: "read failed" };
  await expect(buildQuoteDocumentData("event", "https://example.com")).rejects.toThrow(
    "Could not load quote payment data",
  );
});
