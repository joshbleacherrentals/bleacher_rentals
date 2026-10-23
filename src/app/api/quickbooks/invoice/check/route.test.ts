import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource } from "@/features/quickbooks-integration/invoice/invoiceTypes";

// docs/specs/qbo-invoice-06-totals-check.md §5: admin and accountant only; the body is { eventId };
// the invoice is checked in the connection stored on the quote and the answer is relayed.

const requireAdminOrAccountant = vi.fn(async () => "clerk_admin");
vi.mock("@/features/userAccess/logic/requireAdminOrAccountant", () => ({
  requireAdminOrAccountant: (...args: unknown[]) => (requireAdminOrAccountant as any)(...args),
}));

const loadInvoiceSource = vi.fn(async (..._args: unknown[]): Promise<InvoiceSource | null> => null);
vi.mock("@/features/quickbooks-integration/invoice/loadInvoiceSource", () => ({
  loadInvoiceSource: (...args: unknown[]) => loadInvoiceSource(...args),
}));

const runTotalsCheck = vi.fn(async (..._args: unknown[]): Promise<any> => null);
vi.mock("@/features/quickbooks-integration/invoice/checkInvoiceTotals", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/quickbooks-integration/invoice/checkInvoiceTotals")
  >()),
  runTotalsCheck: (...args: unknown[]) => runTotalsCheck(...args),
}));

import { POST } from "./route";
import { QboReadError } from "@/features/quickbooks-integration/invoice/checkInvoiceTotals";
import { NextRequest } from "next/server";

const EVENT_ID = "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

/** A quote that is invoiced in a company its office no longer uses. */
const linkedSource = (over: Partial<InvoiceSource> = {}): InvoiceSource => ({
  eventId: EVENT_ID,
  eventStatus: "booked",
  deleted: false,
  invoiceNumber: 100200300,
  title: "SC - CLEMSON - RALLY",
  eventTypeName: "Corporate",
  eventStart: "2026-11-01",
  dueDate: "2026-10-15",
  venue: { street: "1 Main St", city: "Clemson", state: "SC", zip: "29631" },
  billedContact: null,
  billToName: "Pat Lee",
  amountCents: 750000,
  taxCents: 52500,
  currency: "USD",
  canadianProvince: null,
  salesOfficeId: "office-1",
  connectionId: "conn-office",
  qboInvoiceId: "inv-1",
  qboInvoiceConnectionId: "conn-stored",
  qboInvoiceHash: "hash-A",
  qboInvoiceSentHash: "hash-A",
  qboInvoiceMismatch: false,
  ...over,
});

const request = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/quickbooks/invoice/check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const refusal = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/quickbooks/invoice/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminOrAccountant.mockImplementation(async () => "clerk_admin");
    loadInvoiceSource.mockImplementation(async () => linkedSource());
    runTotalsCheck.mockImplementation(async () => ({
      status: "checked",
      matches: true,
      differences: [],
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("who may call it", () => {
    it("answers 401 for a missing session and does nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(401, "Unauthorized");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(401);
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runTotalsCheck).not.toHaveBeenCalled();
    });

    it("answers 403 for anyone but an admin or an accountant and does nothing", async () => {
      requireAdminOrAccountant.mockImplementation(async () => {
        throw refusal(403, "Forbidden");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(403);
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runTotalsCheck).not.toHaveBeenCalled();
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
    ])("answers 400 for %s and does nothing", async (_label, body) => {
      const res = await POST(request(body));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing or invalid eventId" });
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runTotalsCheck).not.toHaveBeenCalled();
    });
  });

  describe("a quote that cannot be checked", () => {
    it("answers 404 when there is no such event", async () => {
      loadInvoiceSource.mockImplementation(async () => null);

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Quote not found." });
      expect(runTotalsCheck).not.toHaveBeenCalled();
    });

    it("answers 409 when the event has no invoice", async () => {
      loadInvoiceSource.mockImplementation(async () => linkedSource({ qboInvoiceId: null }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "This quote has no QuickBooks invoice yet." });
      expect(runTotalsCheck).not.toHaveBeenCalled();
    });

    it("loads the quote by the event id and the request's origin", async () => {
      await POST(request({ eventId: EVENT_ID }));

      expect(loadInvoiceSource).toHaveBeenCalledWith(EVENT_ID, "http://localhost:3000");
    });
  });

  describe("relaying the check", () => {
    it("checked: 200 with the comparison", async () => {
      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "checked", matches: true, differences: [] });
    });

    it("checked with a difference: 200 with the differences listed", async () => {
      const differences = [{ field: "tax", quoteCents: 52500, qboCents: 52501 }];
      runTotalsCheck.mockImplementation(async () => ({
        status: "checked",
        matches: false,
        differences,
      }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "checked", matches: false, differences });
    });

    it("invoice_missing: 200 with the status alone", async () => {
      runTotalsCheck.mockImplementation(async () => ({ status: "missing" }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "invoice_missing" });
    });

    it("checks the quote that was loaded, whose invoice is in the stored connection", async () => {
      const source = linkedSource();
      loadInvoiceSource.mockImplementation(async () => source);

      await POST(request({ eventId: EVENT_ID }));

      expect(runTotalsCheck).toHaveBeenCalledTimes(1);
      expect(runTotalsCheck).toHaveBeenCalledWith(EVENT_ID, source);
      const [, checked] = runTotalsCheck.mock.calls[0] as [string, InvoiceSource];
      expect(checked.qboInvoiceConnectionId).toBe("conn-stored");
      expect(checked.qboInvoiceConnectionId).not.toBe(checked.connectionId);
    });
  });

  describe("failures", () => {
    it("QuickBooks cannot be reached: 502 with its readable message", async () => {
      runTotalsCheck.mockImplementation(async () => {
        throw new QboReadError("QuickBooks invoice read failed: fetch failed");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "QuickBooks invoice read failed: fetch failed" });
    });

    it("a failure that is not QuickBooks' (the database) is a 500 with its message", async () => {
      runTotalsCheck.mockImplementation(async () => {
        throw new Error("Failed to save the totals check: boom");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to save the totals check: boom" });
    });

    it("a quote that fails to load is a 500", async () => {
      loadInvoiceSource.mockImplementation(async () => {
        throw new Error("Failed to read the event: boom");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(runTotalsCheck).not.toHaveBeenCalled();
    });
  });
});
