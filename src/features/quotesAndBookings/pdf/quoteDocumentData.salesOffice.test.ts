import { beforeEach, expect, it, vi } from "vitest";
const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, unknown> }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = () => ({ data: tables[table] ?? [], error: null });
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
  tables.Events = {
    id: "event",
    event_name: "Quote",
    tax_percent: 0,
    tax_amount_cents: 0,
    sales_office_uuid: "office",
  };
  tables.EventLineItems = [{ header: "Rental", quantity: 1, value_cents: 100000, currency: "USD" }];
  tables.PaymentInstallments = [];
  tables.PaymentHistory = [];
});
it("carries the office's payment info from the database onto the customer's quote", async () => {
  tables.SalesOffices = {
    name: "Texas",
    phone: null,
    payment_info: "  ACH to Bleacher Rentals TX\nRouting 123  ",
    Addresses: { street: "1 Main St", city: "Dallas", state_province: "TX", zip_postal: "75001" },
  };
  const doc = await buildQuoteDocumentData("event", "https://example.com");
  expect(doc?.company.paymentInfo).toBe("ACH to Bleacher Rentals TX\nRouting 123");
});
it("treats a blank payment info as none, so the quote shows no payment line", async () => {
  tables.SalesOffices = { name: "Ontario", phone: null, payment_info: "   ", Addresses: null };
  const doc = await buildQuoteDocumentData("event", "https://example.com");
  expect(doc?.company.paymentInfo).toBeNull();
});
