import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice as an admin (docs/specs/qbo-invoice-04-create.md §9: S1, S2, S3, S6
 * and S7).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * route reaches QuickBooks, which a browser test cannot replace from outside the server, so:
 *  - S2, S3 and S6 call the real route on a quote that the route refuses before it reaches
 *    QuickBooks (not booked / no invoice number / already linked), so no QuickBooks call is made;
 *  - S1 replaces the route with a fake that writes to Events what step 9 writes, then checks that
 *    the QuickBooks Invoice box on the quote is ticked after a reload;
 *  - S7 (the warnings) needs a QuickBooks sandbox company and is asserted in createInvoice.test.ts.
 */

const INVOICE_ROUTE = "/api/quickbooks/invoice";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** A minimal event of the given shape, made with the service role. */
async function createEvent(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await serviceRole()
    .from("Events")
    .insert({
      event_name: `E2E Invoice ${Math.floor(Math.random() * 1_000_000)}`,
      event_start: "2026-10-01",
      event_end: "2026-10-03",
      lenient: false,
      must_be_clean: false,
      ...fields,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createEvent failed: ${error?.message}`);
  return data.id as string;
}

const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });

test.describe("Create invoice route (admin)", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote(); // status "quoted", with an invoice number
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: a created invoice ticks QuickBooks Invoice on the quote", async ({ page }) => {
    // The fake does what the real route's step 9 does, then answers `created`.
    await page.route(`**${INVOICE_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await serviceRole()
        .from("Events")
        .update({ qbo_invoice_id: "e2e-fake-invoice", is_qbo: true })
        .eq("id", eventId);
      await route.fulfill({
        json: {
          status: "created",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: "e2e-fake-invoice",
          warnings: [],
        },
      });
    });

    try {
      await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
      await expect(qboFlag(page)).not.toBeChecked({ timeout: 60_000 });

      const body = await page.evaluate(async (eventId) => {
        const res = await fetch("/api/quickbooks/invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        return res.json();
      }, quote.eventId);
      expect(body.status).toBe("created");

      await page.reload();
      await expect(qboFlag(page)).toBeChecked({ timeout: 60_000 });
    } finally {
      await serviceRole()
        .from("Events")
        .update({ qbo_invoice_id: null, is_qbo: false })
        .eq("id", quote.eventId);
    }
  });

  test("S2: a quote that is not booked is refused with its status", async ({ page }) => {
    const res = await page.request.post(INVOICE_ROUTE, { data: { eventId: quote.eventId } });

    expect(res.status()).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("booked");
    expect(error).toContain("quoted");
  });

  test("S3: a booked quote with no invoice number is refused with the issue's message", async ({
    page,
  }) => {
    const eventId = await createEvent({ event_status: "booked", invoice_number: null });
    try {
      const res = await page.request.post(INVOICE_ROUTE, { data: { eventId } });

      expect(res.status()).toBe(400);
      expect((await res.json()).error).toContain("no invoice number");
    } finally {
      await cleanupQuote(eventId);
    }
  });

  test("S6: a quote that already has an invoice is refused with 409", async ({ page }) => {
    const eventId = await createEvent({
      event_status: "booked",
      invoice_number: 900_000_000 + Math.floor(Math.random() * 90_000_000),
      qbo_invoice_id: "e2e-existing-invoice",
    });
    try {
      const res = await page.request.post(INVOICE_ROUTE, { data: { eventId } });

      expect(res.status()).toBe(409);
      expect((await res.json()).error).toContain("already has");
    } finally {
      await cleanupQuote(eventId);
    }
  });

  test.fixme("S7: a Canadian quote and a quote with no Class are created with the warnings", async () => {
    // Needs a QuickBooks sandbox company with the Item, a province tax code and a zone with no
    // Class; the server's own QuickBooks calls cannot be replaced from the browser. The warnings
    // and the bodies are asserted in createInvoice.test.ts.
  });
});
