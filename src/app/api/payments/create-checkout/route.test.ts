import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCheckoutCreate, tableData } = vi.hoisted(() => ({
  mockCheckoutCreate: vi.fn(),
  tableData: {} as Record<string, unknown>,
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: mockCheckoutCreate } };
  },
}));

// Table-aware mock: from(table)... resolves whatever the test put in
// tableData[table] — an object for `.single()` reads, an array for list reads.
// The route (event display), the Stripe helper (event -> office -> connection)
// and the payment context (currency + balance) all read through this.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const value = tableData[table] as any;
      const one = () =>
        Promise.resolve({
          data: Array.isArray(value) ? (value[0] ?? null) : (value ?? null),
          error: null,
        });
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        single: one,
        maybeSingle: one,
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: Array.isArray(value) ? value : value ? [value] : [], error: null }),
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/payments/create-checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A fully-configured event -> office -> active connection chain, priced at
 * $1,000.00 in a USD office with nothing paid yet.
 */
function seedHappyPath(
  over: {
    event?: object;
    office?: object;
    connection?: object;
    qbo?: object | null;
    address?: object | null;
    lineItems?: object[];
    installments?: object[];
    payments?: object[];
  } = {},
) {
  tableData.Events = {
    id: "evt-1",
    event_name: "Game Day",
    invoice_number: 12345,
    sales_office_uuid: "office-1",
    tax_percent: 0,
    tax_amount_cents: null,
    ...over.event,
  };
  tableData.SalesOffices = {
    stripe_connection_uuid: "conn-1",
    quickbook_uuid: "qbo-1",
    address_uuid: "addr-1",
    ...over.office,
  };
  tableData.StripeConnections = {
    id: "conn-1",
    stripe_account_id: "acct_office1",
    deleted_at: null,
    charges_enabled: true,
    ...over.connection,
  };
  tableData.QboConnections = over.qbo === undefined ? { currency: "USD" } : over.qbo;
  tableData.Addresses = over.address === undefined ? { state_province: "Florida" } : over.address;
  tableData.EventLineItems = over.lineItems ?? [{ quantity: 1, value_cents: 100000 }];
  tableData.PaymentInstallments = over.installments ?? [];
  tableData.PaymentHistory = over.payments ?? [];
}

/** A succeeded USD payment on the seeded event. */
function succeededPayment(over: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    installment_id: null,
    amount_cents: 5000,
    currency: "USD",
    status: "succeeded",
    paid_at: "2026-09-01T10:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

describe("POST /api/payments/create-checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const table of Object.keys(tableData)) tableData[table] = undefined;
    mockCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_123" });
  });

  it("returns 400 when eventId is missing", async () => {
    const res = await POST(makeRequest({ amountCents: 5000, payerName: "John" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required fields");
  });

  it("returns 400 when amountCents is missing", async () => {
    const res = await POST(makeRequest({ eventId: "evt-1", payerName: "John" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when payerName is missing", async () => {
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when event not found", async () => {
    const res = await POST(
      makeRequest({ eventId: "evt-missing", amountCents: 5000, payerName: "John" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when the event has no sales office", async () => {
    seedHappyPath({ event: { sales_office_uuid: null } });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "John" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no sales office/i);
  });

  it("returns 422 when the office has no Stripe connection", async () => {
    seedHappyPath({ office: { stripe_connection_uuid: null } });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "John" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the connection is soft-deleted", async () => {
    seedHappyPath({ connection: { deleted_at: "2026-07-22T00:00:00Z" } });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "John" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/removed/i);
  });

  it("returns 422 when the connection can't take charges yet", async () => {
    seedHappyPath({ connection: { charges_enabled: false } });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "John" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/ready/i);
  });

  it("opens Stripe's own checkout in French for a French quote", async () => {
    // The client sends the language the quote is being read in. Without this the
    // page switches to English mid-payment, which is where trust is thinnest.
    seedHappyPath();
    await POST(
      makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "Marie", language: "fr" }),
    );

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "fr-CA" }),
      expect.anything(),
    );
  });

  it("lets Stripe detect the language for anything other than French", async () => {
    seedHappyPath();
    for (const language of ["en", undefined, "klingon"]) {
      mockCheckoutCreate.mockClear();
      await POST(
        makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "Marie", language }),
      );
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "auto" }),
        expect.anything(),
      );
    }
  });

  it("creates the session on the office's connected account and returns URL", async () => {
    seedHappyPath();
    const res = await POST(
      makeRequest({
        eventId: "evt-1",
        amountCents: 15000,
        currency: "USD",
        payerName: "Jane Doe",
        payerEmail: "jane@test.com",
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://checkout.stripe.com/session_123");

    expect(mockCheckoutCreate).toHaveBeenCalledOnce();
    const [sessionArgs, requestOpts] = mockCheckoutCreate.mock.calls[0];
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(15000);
    expect(sessionArgs.line_items[0].price_data.currency).toBe("usd");
    expect(sessionArgs.metadata.eventId).toBe("evt-1");
    expect(sessionArgs.metadata.payerName).toBe("Jane Doe");
    expect(sessionArgs.metadata.stripeConnectionId).toBe("conn-1");
    // Email is left editable on the Checkout page (not prefilled/locked); the
    // receipt is sent later by the webhook from the entered address.
    expect(sessionArgs.customer_email).toBeUndefined();
    // Routed to the connected account, not the platform account.
    expect(requestOpts).toEqual({ stripeAccount: "acct_office1" });
  });

  it("charges in the office's currency, ignoring the currency in the request body", async () => {
    // /quote/[id] is public, so the body is attacker-controlled: a request that
    // asks for CAD on a USD quote must still be charged in USD.
    seedHappyPath();
    await POST(
      makeRequest({ eventId: "evt-1", amountCents: 10000, currency: "CAD", payerName: "Bob" }),
    );
    expect(mockCheckoutCreate.mock.calls[0][0].line_items[0].price_data.currency).toBe("usd");
  });

  it("charges in CAD when the office's QuickBooks connection reports CAD", async () => {
    seedHappyPath({ qbo: { currency: "CAD" } });
    await POST(
      makeRequest({ eventId: "evt-1", amountCents: 10000, currency: "USD", payerName: "Bob" }),
    );
    expect(mockCheckoutCreate.mock.calls[0][0].line_items[0].price_data.currency).toBe("cad");
  });

  it("falls back to the office province when the QBO connection reports no currency", async () => {
    seedHappyPath({ qbo: { currency: null }, address: { state_province: "Ontario" } });
    await POST(makeRequest({ eventId: "evt-1", amountCents: 10000, payerName: "Bob" }));
    expect(mockCheckoutCreate.mock.calls[0][0].line_items[0].price_data.currency).toBe("cad");
  });

  it("rejects an amount above the outstanding balance", async () => {
    seedHappyPath({ payments: [succeededPayment({ amount_cents: 60000 })] });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 50000, payerName: "Bob" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/balance/i);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("allows an amount exactly equal to the outstanding balance", async () => {
    seedHappyPath({ payments: [succeededPayment({ amount_cents: 60000 })] });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 40000, payerName: "Bob" }));
    expect(res.status).toBe(200);
  });

  it("rejects a payment on an invoice that is already paid in full", async () => {
    seedHappyPath({ payments: [succeededPayment({ amount_cents: 100000 })] });
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "Bob" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/paid in full/i);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("rejects an amount below Stripe's 50-cent minimum", async () => {
    seedHappyPath();
    const res = await POST(makeRequest({ eventId: "evt-1", amountCents: 49, payerName: "Bob" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/0\.50/);
  });

  it("rejects an amount that is not a whole number of cents", async () => {
    seedHappyPath();
    for (const amountCents of [1000.5, "5000", Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      const res = await POST(makeRequest({ eventId: "evt-1", amountCents, payerName: "Bob" }));
      expect(res.status).toBe(400);
    }
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("uses eventId in success_url/cancel_url when invoice_number is null", async () => {
    seedHappyPath({ event: { id: "evt-uuid-123", invoice_number: null } });
    await POST(makeRequest({ eventId: "evt-uuid-123", amountCents: 5000, payerName: "Bob" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0][0];
    expect(sessionArgs.success_url).toContain("/quote/evt-uuid-123");
    expect(sessionArgs.cancel_url).toContain("/quote/evt-uuid-123");
    expect(sessionArgs.success_url).not.toContain("987654321");
  });

  it("uses eventId (not invoice_number) in success_url/cancel_url even when invoice_number is set", async () => {
    // Regression test: /quote/[eventUUID] expects the event's UUID. Using the
    // human-facing invoice_number here sent customers to a 404 after payment.
    seedHappyPath({ event: { id: "evt-uuid-123", invoice_number: 987654321 } });
    await POST(makeRequest({ eventId: "evt-uuid-123", amountCents: 5000, payerName: "Bob" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0][0];
    expect(sessionArgs.success_url).toBe(
      "http://localhost:3000/quote/evt-uuid-123/payment-success",
    );
    expect(sessionArgs.cancel_url).toBe(
      "http://localhost:3000/quote/evt-uuid-123?payment=cancelled",
    );
    expect(sessionArgs.success_url).not.toContain("987654321");
  });

  it("sends success_url to the standalone payment-success page, not the pay tab", async () => {
    seedHappyPath();
    await POST(makeRequest({ eventId: "evt-1", amountCents: 5000, payerName: "Bob" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0][0];
    expect(sessionArgs.success_url).toBe("http://localhost:3000/quote/evt-1/payment-success");
    expect(sessionArgs.success_url).not.toContain("?payment=success");
  });
});
