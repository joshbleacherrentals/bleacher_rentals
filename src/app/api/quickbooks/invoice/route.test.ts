import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-04-create.md §3: admin and accountant only; the body is { eventId,
// customerChoice? }; each result of createInvoice is relayed with its HTTP code.

const requireAdminOrAccountant = vi.fn(async () => "clerk_admin");
vi.mock("@/features/userAccess/logic/requireAdminOrAccountant", () => ({
  requireAdminOrAccountant: (...args: unknown[]) => (requireAdminOrAccountant as any)(...args),
}));

const resolveUserAccessForRequest = vi.fn(
  async (_clerkId: string): Promise<any> => ({
    status: "active",
    roles: ["admin"],
    userId: "user-1",
    accountManagerId: null,
  }),
);
vi.mock("@/features/userAccess/logic/resolveUserAccessForRequest", () => ({
  resolveUserAccessForRequest: (...args: [string]) => resolveUserAccessForRequest(...args),
}));

const createInvoice = vi.fn(
  async (_params: unknown): Promise<any> => ({
    status: "created",
    docNumber: "100200300",
    qboInvoiceId: "inv-1",
    warnings: [],
  }),
);
vi.mock("@/features/quickbooks-integration/invoice/createInvoice", () => ({
  createInvoice: (...args: [unknown]) => createInvoice(...args),
}));

import { POST, maxDuration } from "./route";
import { NextRequest } from "next/server";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

const request = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/quickbooks/invoice", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const refusal = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/quickbooks/invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminOrAccountant.mockImplementation(async () => "clerk_admin");
    resolveUserAccessForRequest.mockImplementation(async () => ({
      status: "active",
      roles: ["admin"],
      userId: "user-1",
      accountManagerId: null,
    }));
    createInvoice.mockImplementation(async () => ({
      status: "created",
      docNumber: "100200300",
      qboInvoiceId: "inv-1",
      warnings: [],
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sets a longer maxDuration, as create-bill does", () => {
    expect(maxDuration).toBe(60);
  });

  describe("who may call it", () => {
    it("answers 401 for a missing session and does nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(401, "Unauthorized");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(401);
      expect(createInvoice).not.toHaveBeenCalled();
    });

    it("answers 403 for anyone but an admin or an accountant and does nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(403, "Forbidden");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(403);
      expect(createInvoice).not.toHaveBeenCalled();
    });

    it("answers 403 when the user's access cannot be resolved", async () => {
      resolveUserAccessForRequest.mockImplementation(async () => ({
        status: "blocked",
        reason: "cannot-find-account",
      }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(403);
      expect(createInvoice).not.toHaveBeenCalled();
    });
  });

  describe("the body", () => {
    it.each([
      ["no body", ""],
      ["not JSON", "{not json"],
      ["no eventId", {}],
      ["an eventId that is not text", { eventId: 7 }],
      ["an eventId that is not a uuid", { eventId: "not-a-uuid" }],
      ["an invoice number instead of the uuid", { eventId: "100200300" }],
      ["a customerChoice of an unknown kind", { eventId: EVENT_ID, customerChoice: { kind: "x" } }],
      [
        "an existing customerChoice with no customerId",
        { eventId: EVENT_ID, customerChoice: { kind: "existing" } },
      ],
      [
        "an existing customerChoice with an empty customerId",
        { eventId: EVENT_ID, customerChoice: { kind: "existing", customerId: "" } },
      ],
      ["a customerChoice that is not an object", { eventId: EVENT_ID, customerChoice: "new" }],
    ])("answers 400 for %s and does nothing", async (_label, body) => {
      const res = await POST(request(body));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing or invalid eventId" });
      expect(createInvoice).not.toHaveBeenCalled();
    });

    it("hands createInvoice the event, the user, the origin and no choice", async () => {
      await POST(request({ eventId: EVENT_ID }));

      expect(createInvoice).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        customerChoice: undefined,
        userUuid: "user-1",
        origin: "http://localhost:3000",
      });
      expect(resolveUserAccessForRequest).toHaveBeenCalledWith("clerk_admin");
    });

    it("hands over a choice of an existing customer", async () => {
      await POST(
        request({ eventId: EVENT_ID, customerChoice: { kind: "existing", customerId: "55" } }),
      );

      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ customerChoice: { kind: "existing", customerId: "55" } }),
      );
    });

    it("hands over a choice of a new customer", async () => {
      await POST(request({ eventId: EVENT_ID, customerChoice: { kind: "new" } }));

      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ customerChoice: { kind: "new" } }),
      );
    });
  });

  describe("relaying the result", () => {
    it("created: 200 with the invoice and its warnings", async () => {
      createInvoice.mockImplementation(async () => ({
        status: "created",
        docNumber: "100200300",
        qboInvoiceId: "inv-1",
        warnings: [{ code: "pdf_not_attached", reason: "boom" }],
      }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "created",
        docNumber: "100200300",
        qboInvoiceId: "inv-1",
        warnings: [{ code: "pdf_not_attached", reason: "boom" }],
      });
    });

    it("choose_customer: 200 with the candidates", async () => {
      const candidates = [
        { id: "1", displayName: "Pat Lee", companyName: "Acme", email: "pat@x.com" },
        { id: "2", displayName: "Pat Lee", companyName: null, email: null },
      ];
      createInvoice.mockImplementation(async () => ({ status: "choose_customer", candidates }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "choose_customer", candidates });
    });

    it("invoice_number_exists: 200 with the invoice", async () => {
      const invoice = { id: "9", number: "100200300", customerName: "Pat Lee", totalCents: 806250 };
      createInvoice.mockImplementation(async () => ({ status: "invoice_number_exists", invoice }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "invoice_number_exists", invoice });
    });

    it.each([400, 404, 409, 502])("an error of %i: that status with { error }", async (code) => {
      createInvoice.mockImplementation(async () => ({
        status: "error",
        httpStatus: code,
        error: `fault ${code}`,
      }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(code);
      expect(await res.json()).toEqual({ error: `fault ${code}` });
    });

    it("an unexpected failure: 500 with its message", async () => {
      createInvoice.mockImplementation(async () => {
        throw new Error("database is down");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "database is down" });
    });
  });
});
