import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource } from "@/features/quickbooks-integration/invoice/invoiceTypes";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";

// docs/specs/qbo-invoice-06-totals-check.md §6 (the contract) and
// docs/specs/qbo-invoice-06a-check-on-save.md §3 (the guard): any role that may open
// /quotes-bookings and can read the quote; the body is { eventId }; the invoice is checked in the
// connection stored on the quote; an admin and an accountant get the whole answer, anyone else the
// status only.

const auth = vi.fn(async (): Promise<{ userId: string | null }> => ({ userId: "clerk_1" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));

type Access =
  | { status: "active"; roles: WebRole[]; userId: string; accountManagerId: string | null }
  | { status: "blocked"; reason: string };
const resolveUserAccessForRequest = vi.fn(async (_clerkId: string): Promise<Access> => {
  throw new Error("set in beforeEach");
});
vi.mock("@/features/userAccess/logic/resolveUserAccessForRequest", () => ({
  resolveUserAccessForRequest: (clerkId: string) => resolveUserAccessForRequest(clerkId),
}));

// What the caller's own token can read (row-level security decides): the event row, or nothing.
const readable = { row: { id: "event" } as { id: string } | null, error: null as unknown };
const readFilters: unknown[] = [];
vi.mock("@/utils/supabase/getClerkSupabaseServerClient", () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          readFilters.push([table, col, val]);
          return chain;
        },
        maybeSingle: async () => ({ data: readable.row, error: readable.error }),
      };
      return chain;
    },
  }),
}));

const loadInvoiceSource = vi.fn(async (..._args: unknown[]): Promise<InvoiceSource | null> => null);
vi.mock("@/features/quickbooks-integration/invoice/loadInvoiceSource", () => ({
  loadInvoiceSource: (...args: unknown[]) => loadInvoiceSource(...args),
}));

const runInvoiceCheck = vi.fn(async (..._args: unknown[]): Promise<any> => null);
vi.mock("@/features/quickbooks-integration/invoice/checkInvoice", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/quickbooks-integration/invoice/checkInvoice")
  >()),
  runInvoiceCheck: (...args: unknown[]) => runInvoiceCheck(...args),
}));

import { POST } from "./route";
import { QboReadError } from "@/features/quickbooks-integration/invoice/checkInvoice";
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
  qboInvoiceMismatch: false,
  qboInvoiceMismatchReasons: null,
  ...over,
});

const active = (...roles: WebRole[]): Access => ({
  status: "active",
  roles,
  userId: "user-1",
  accountManagerId: null,
});

const request = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/quickbooks/invoice/check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const CHECKED = {
  status: "checked",
  matches: false,
  reasons: ["dates"],
  differences: [{ reason: "dates", field: "Due date", quote: "2026-10-15", qbo: "2026-10-20" }],
};

describe("POST /api/quickbooks/invoice/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFilters.length = 0;
    auth.mockImplementation(async () => ({ userId: "clerk_1" }));
    resolveUserAccessForRequest.mockImplementation(async () => active("admin"));
    readable.row = { id: EVENT_ID };
    readable.error = null;
    loadInvoiceSource.mockImplementation(async () => linkedSource());
    runInvoiceCheck.mockImplementation(async () => ({
      status: "checked",
      matches: true,
      reasons: [],
      differences: [],
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("who may call it (06a §3)", () => {
    it("answers 401 for a missing session and does nothing", async () => {
      auth.mockImplementation(async () => ({ userId: null }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(401);
      expect(resolveUserAccessForRequest).not.toHaveBeenCalled();
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });

    it.each([
      [
        "an account that is blocked",
        { status: "blocked", reason: "account-deactivated" } as Access,
      ],
      ["a driver", active("driver")],
      ["a maintainer", active("maintainer")],
      ["a developer", active("developer")],
    ])("answers 403 for %s and does nothing", async (_label, access) => {
      resolveUserAccessForRequest.mockImplementation(async () => access);

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(403);
      expect(readFilters).toEqual([]);
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });

    it.each([["admin"], ["account_manager"], ["viewer"], ["accountant"]] as Array<[WebRole]>)(
      "lets a %s through",
      async (role) => {
        resolveUserAccessForRequest.mockImplementation(async () => active(role));

        const res = await POST(request({ eventId: EVENT_ID }));

        expect(res.status).toBe(200);
        expect(runInvoiceCheck).toHaveBeenCalledTimes(1);
      },
    );

    it("asks who the signed-in user is by their Clerk id", async () => {
      await POST(request({ eventId: EVENT_ID }));

      expect(resolveUserAccessForRequest).toHaveBeenCalledWith("clerk_1");
    });

    it("answers 404 for a quote the caller's own token cannot read, and checks nothing", async () => {
      readable.row = null;

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Quote not found." });
      expect(readFilters).toEqual([["Events", "id", EVENT_ID]]);
      expect(loadInvoiceSource).not.toHaveBeenCalled();
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });

    it("a failure to read the quote with the caller's token is a 500", async () => {
      readable.row = null;
      readable.error = { message: "boom" };

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(runInvoiceCheck).not.toHaveBeenCalled();
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
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });
  });

  describe("a quote that cannot be checked", () => {
    it("answers 404 when the service role finds no such event", async () => {
      loadInvoiceSource.mockImplementation(async () => null);

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Quote not found." });
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });

    it("answers 409 when the event has no invoice", async () => {
      loadInvoiceSource.mockImplementation(async () => linkedSource({ qboInvoiceId: null }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "This quote has no QuickBooks invoice yet." });
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });

    it("loads the quote by the event id and the request's origin", async () => {
      await POST(request({ eventId: EVENT_ID }));

      expect(loadInvoiceSource).toHaveBeenCalledWith(EVENT_ID, "http://localhost:3000");
    });
  });

  describe("relaying the check to an admin and an accountant: the whole answer", () => {
    it.each([["admin"], ["accountant"]] as Array<[WebRole]>)(
      "%s: checked, with the reasons and the differences",
      async (role) => {
        resolveUserAccessForRequest.mockImplementation(async () => active(role));
        runInvoiceCheck.mockImplementation(async () => CHECKED);

        const res = await POST(request({ eventId: EVENT_ID }));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(CHECKED);
      },
    );

    it("an admin who is also an account manager still gets the whole answer", async () => {
      resolveUserAccessForRequest.mockImplementation(async () =>
        active("account_manager", "admin"),
      );
      runInvoiceCheck.mockImplementation(async () => CHECKED);

      expect(await (await POST(request({ eventId: EVENT_ID }))).json()).toEqual(CHECKED);
    });

    it("a match: 200 with the comparison", async () => {
      const res = await POST(request({ eventId: EVENT_ID }));

      expect(await res.json()).toEqual({
        status: "checked",
        matches: true,
        reasons: [],
        differences: [],
      });
    });

    it("invoice_missing: 200 with the status alone", async () => {
      runInvoiceCheck.mockImplementation(async () => ({ status: "missing" }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "invoice_missing" });
    });

    it("skipped: 200 with the status and the message", async () => {
      runInvoiceCheck.mockImplementation(async () => ({
        status: "skipped",
        message: "Add the venue's street address and state to the quote and try again.",
      }));

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "skipped",
        message: "Add the venue's street address and state to the quote and try again.",
      });
    });

    it("checks the quote that was loaded, whose invoice is in the stored connection", async () => {
      const source = linkedSource();
      loadInvoiceSource.mockImplementation(async () => source);

      await POST(request({ eventId: EVENT_ID }));

      expect(runInvoiceCheck).toHaveBeenCalledTimes(1);
      expect(runInvoiceCheck).toHaveBeenCalledWith(EVENT_ID, source);
      const [, checked] = runInvoiceCheck.mock.calls[0] as [string, InvoiceSource];
      expect(checked.qboInvoiceConnectionId).toBe("conn-stored");
      expect(checked.qboInvoiceConnectionId).not.toBe(checked.connectionId);
    });
  });

  describe("relaying the check to anyone else: the status only (06a §1)", () => {
    it.each([["account_manager"], ["viewer"]] as Array<[WebRole]>)(
      "%s: checked carries no reasons and no QuickBooks values",
      async (role) => {
        resolveUserAccessForRequest.mockImplementation(async () => active(role));
        runInvoiceCheck.mockImplementation(async () => CHECKED);

        const res = await POST(request({ eventId: EVENT_ID }));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "checked" });
      },
    );

    it("the check still ran and stored its answer for them", async () => {
      resolveUserAccessForRequest.mockImplementation(async () => active("viewer"));

      await POST(request({ eventId: EVENT_ID }));

      expect(runInvoiceCheck).toHaveBeenCalledTimes(1);
    });

    it("invoice_missing and skipped are relayed as they are", async () => {
      resolveUserAccessForRequest.mockImplementation(async () => active("viewer"));
      runInvoiceCheck.mockImplementation(async () => ({ status: "missing" }));
      expect(await (await POST(request({ eventId: EVENT_ID }))).json()).toEqual({
        status: "invoice_missing",
      });

      runInvoiceCheck.mockImplementation(async () => ({ status: "skipped", message: "no venue" }));
      expect(await (await POST(request({ eventId: EVENT_ID }))).json()).toEqual({
        status: "skipped",
        message: "no venue",
      });
    });
  });

  describe("failures", () => {
    it("QuickBooks cannot be reached: 502 with its readable message", async () => {
      runInvoiceCheck.mockImplementation(async () => {
        throw new QboReadError("QuickBooks invoice read failed: fetch failed");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "QuickBooks invoice read failed: fetch failed" });
    });

    it("a failure that is not QuickBooks' (the database) is a 500 with its message", async () => {
      runInvoiceCheck.mockImplementation(async () => {
        throw new Error("Failed to save the invoice check: boom");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to save the invoice check: boom" });
    });

    it("a quote that fails to load is a 500", async () => {
      loadInvoiceSource.mockImplementation(async () => {
        throw new Error("Failed to read the event: boom");
      });

      const res = await POST(request({ eventId: EVENT_ID }));

      expect(res.status).toBe(500);
      expect(runInvoiceCheck).not.toHaveBeenCalled();
    });
  });
});
