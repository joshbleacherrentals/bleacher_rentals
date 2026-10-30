import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-08-view-and-check.md §3: GET ?eventId=…, admin or accountant only; 400 for a
// missing or non-uuid eventId; 404 for no such event, and 404 with its own message for no link;
// otherwise a 302 to the invoice's page in the environment the server runs in. The link is read
// with the service role, and the route returns nothing but a redirect or { error }.

const requireAdminOrAccountant = vi.fn(async (): Promise<string> => "clerk_admin");
vi.mock("@/features/userAccess/logic/requireAdminOrAccountant", () => ({
  requireAdminOrAccountant: () => requireAdminOrAccountant(),
}));

// What the service role reads from Events.
const stored = {
  row: { id: "event", qbo_invoice_id: "145" } as {
    id: string;
    qbo_invoice_id: string | null;
  } | null,
  error: null as { message: string } | null,
};
const reads: unknown[] = [];
const getSupabaseAdmin = vi.fn(() => ({
  from: (table: string) => {
    const chain: any = {
      select: (columns: string) => {
        reads.push(["select", table, columns]);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        reads.push(["eq", column, value]);
        return chain;
      },
      maybeSingle: async () => ({ data: stored.row, error: stored.error }),
    };
    return chain;
  },
}));
vi.mock("@/features/quickbooks-integration/invoice/createInvoice", () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

const request = (query = `?eventId=${EVENT_ID}`) =>
  new NextRequest(`http://localhost:3000/api/quickbooks/invoice/view${query}`);

const refusal = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("GET /api/quickbooks/invoice/view", () => {
  const originalEnvironment = process.env.QBO_ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    reads.length = 0;
    process.env.QBO_ENVIRONMENT = "production";
    requireAdminOrAccountant.mockImplementation(async () => "clerk_admin");
    stored.row = { id: EVENT_ID, qbo_invoice_id: "145" };
    stored.error = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.QBO_ENVIRONMENT;
    else process.env.QBO_ENVIRONMENT = originalEnvironment;
  });

  describe("who may call it", () => {
    it("answers 401 for a missing session and reads nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(401, "Unauthorized");
      });

      const res = await GET(request());

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it("answers 403 for anyone who is not an admin or an accountant and reads nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(403, "Forbidden");
      });

      const res = await GET(request());

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });
  });

  describe("the eventId", () => {
    it.each([
      ["no eventId at all", ""],
      ["an empty eventId", "?eventId="],
      ["an eventId that is not a uuid", "?eventId=not-a-uuid"],
      ["a uuid with something added", `?eventId=${EVENT_ID}x`],
    ])("answers 400 for %s and reads nothing", async (_name, query) => {
      const res = await GET(request(query));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing or invalid eventId" });
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });
  });

  describe("what the quote holds", () => {
    it("answers 404 when there is no such event", async () => {
      stored.row = null;

      const res = await GET(request());

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Quote not found." });
    });

    it("answers 404 with its own message when the quote has no invoice link", async () => {
      stored.row = { id: EVENT_ID, qbo_invoice_id: null };

      const res = await GET(request());

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "This quote has no QuickBooks invoice yet." });
    });

    it("treats an empty link as no link", async () => {
      stored.row = { id: EVENT_ID, qbo_invoice_id: "" };

      const res = await GET(request());

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "This quote has no QuickBooks invoice yet." });
    });

    it("reads the link with the service role, by the event's id", async () => {
      await GET(request());

      expect(getSupabaseAdmin).toHaveBeenCalledTimes(1);
      expect(reads).toContainEqual(["select", "Events", expect.stringContaining("qbo_invoice_id")]);
      expect(reads).toContainEqual(["eq", "id", EVENT_ID]);
    });
  });

  describe("the redirect", () => {
    it("is a 302 to the invoice's page in production", async () => {
      process.env.QBO_ENVIRONMENT = "production";

      const res = await GET(request());

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("https://app.qbo.intuit.com/app/invoice?txnId=145");
    });

    it("is a 302 to the invoice's page in the sandbox", async () => {
      process.env.QBO_ENVIRONMENT = "sandbox";

      const res = await GET(request());

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://app.sandbox.qbo.intuit.com/app/invoice?txnId=145",
      );
    });

    it("returns nothing else: no body", async () => {
      const res = await GET(request());

      expect(await res.text()).toBe("");
    });
  });

  describe("errors", () => {
    it("answers the generic 500, with no redirect, when the environment is not a known one", async () => {
      process.env.QBO_ENVIRONMENT = "staging";

      const res = await GET(request());

      expect(res.status).toBe(500);
      expect(res.headers.get("Location")).toBeNull();
      expect(Object.keys(await res.json())).toEqual(["error"]);
    });

    it("answers the generic 500 when the environment is not set", async () => {
      delete process.env.QBO_ENVIRONMENT;

      const res = await GET(request());

      expect(res.status).toBe(500);
      expect(res.headers.get("Location")).toBeNull();
    });

    it("answers 500 with { error } only when the database read fails", async () => {
      stored.row = null;
      stored.error = { message: "connection reset" };

      const res = await GET(request());

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(["error"]);
      expect(body.error).toContain("connection reset");
    });
  });
});
