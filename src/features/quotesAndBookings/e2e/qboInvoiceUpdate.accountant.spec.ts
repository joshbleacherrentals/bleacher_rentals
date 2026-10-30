import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice, the update flow, as an accountant (docs/specs/qbo-invoice-05-update.md §8).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * An accountant may update the invoice of a quote of any office. The quote used here has a link but
 * no sales office, so the real route refuses it with 400 before it reaches QuickBooks: a 400 and
 * not a 403 is the proof that the role was let in.
 */

test.describe("Update invoice route (accountant)", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote(); // belongs to no sales office
    const { error } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
      .from("Events")
      .update({ qbo_invoice_id: "e2e-linked-invoice" })
      .eq("id", quote.eventId);
    if (error) throw new Error(`could not link the quote: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("an accountant is allowed to update a quote of another office", async ({ page }) => {
    const res = await page.request.post("/api/quickbooks/invoice", {
      data: { eventId: quote.eventId },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("sales office");
  });
});
