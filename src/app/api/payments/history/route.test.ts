import { describe, it, expect, vi, beforeEach } from "vitest";

let orderResult: { data: any; error: any } = { data: [], error: null };
let selectArgs: unknown[] = [];
let isCalls: unknown[][] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: (...args: unknown[]) => {
        selectArgs = args;
        return {
          eq: () => ({
            is: (...isArgs: unknown[]) => {
              isCalls.push(isArgs);
              return { order: () => orderResult };
            },
          }),
        };
      },
    }),
  }),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/payments/history", () => {
  beforeEach(() => {
    orderResult = { data: [], error: null };
    selectArgs = [];
    isCalls = [];
  });

  // docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md (D1): anyone who knows an event
  // id can call this, and must never learn that a payment was deleted.
  it("asks only for payments that are not deleted", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/history?eventId=evt-1");
    await GET(req);

    expect(isCalls).toEqual([["deleted_at", null]]);
  });

  it("does not select deleted_at or any other deletion column", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/history?eventId=evt-1");
    await GET(req);

    const columns = String(selectArgs[0]);
    expect(columns).not.toMatch(/delet/);
  });

  it("returns 400 when eventId query param is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/history");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing eventId");
  });

  it("returns empty array when no payments exist", async () => {
    orderResult = { data: [], error: null };
    const req = new NextRequest("http://localhost:3000/api/payments/history?eventId=evt-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("returns payment rows", async () => {
    const rows = [
      {
        id: "ph-1",
        amount_cents: 10000,
        currency: "USD",
        status: "succeeded",
        payment_method_type: "card",
        payer_name: "Jane",
        payer_email: "jane@test.com",
        stripe_receipt_url: "https://receipt.stripe.com/r1",
        paid_at: "2026-06-12T10:00:00Z",
        created_at: "2026-06-12T10:00:00Z",
      },
    ];
    orderResult = { data: rows, error: null };

    const req = new NextRequest("http://localhost:3000/api/payments/history?eventId=evt-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("ph-1");
    expect(json[0].amount_cents).toBe(10000);
  });

  it("returns 500 on supabase error", async () => {
    orderResult = { data: null, error: { message: "DB down" } };

    const req = new NextRequest("http://localhost:3000/api/payments/history?eventId=evt-1");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB down");
  });
});
