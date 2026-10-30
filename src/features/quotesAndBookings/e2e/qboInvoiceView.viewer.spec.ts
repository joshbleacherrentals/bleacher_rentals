import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * View in QuickBooks and Check again as a viewer (docs/specs/qbo-invoice-08-view-and-check.md §6, S6):
 * neither is drawn, nor the check time, although the quote has an invoice.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test.describe("View in QuickBooks and Check again (viewer)", () => {
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

  test("S6: a quote with an invoice shows no View, no Check again and no check time; the flag is disabled", async ({
    page,
  }) => {
    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    await expect(page.getByRole("checkbox", { name: "QuickBooks Invoice" })).toBeDisabled({
      timeout: 60_000,
    });
    await expect(page.getByRole("link", { name: "View in QuickBooks" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check again" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update invoice" })).toHaveCount(0);
    await expect(page.getByText("Not checked yet")).toHaveCount(0);
  });
});
