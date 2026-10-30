import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * View in QuickBooks and Check again as an accountant (docs/specs/qbo-invoice-08-view-and-check.md
 * §6, S1): the same two buttons as an admin, on a quote that has an invoice.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts). Nothing is pressed:
 * the routes are not touched.
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test.describe("View in QuickBooks and Check again (accountant)", () => {
  let quote: CreatedQuote;

  test.beforeAll(async () => {
    quote = await createQuote();
    const { error } = await serviceRole()
      .from("Events")
      .update({ qbo_invoice_id: "e2e-linked-invoice", is_qbo: true })
      .eq("id", quote.eventId);
    if (error) throw new Error(`could not link the invoice: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: a quote with an invoice shows both buttons", async ({ page }) => {
    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    await expect(page.getByRole("link", { name: "View in QuickBooks" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  });
});
