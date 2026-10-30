import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The QuickBooks invoice banner as an admin who is not an accountant
 * (docs/specs/qbo-invoice-09-banner.md §6, S5). The other scenarios are in
 * qboInvoiceBanner.accountant.spec.ts.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine; the E2E admin
 * user also has no Users row locally). The data is seeded by writing the columns of Events.
 */

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function updateEvent(eventId: string, fields: Record<string, unknown>) {
  const { error } = await serviceRole().from("Events").update(fields).eq("id", eventId);
  if (error) throw new Error(`updateEvent failed: ${error.message}`);
}

const HEADING = "The QuickBooks invoice does not match this quote.";
const banner = (page: Page) => page.getByRole("alert").filter({ hasText: HEADING });

test.describe("QuickBooks invoice banner (admin who is not an accountant)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote();
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S5: the quote of S3 shows no banner, though the admin can still update the invoice", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates","totals"]',
      is_qbo: true,
    });
    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    // The Update button reads the same local row as the banner would: once it is drawn, the row is in.
    await expect(page.getByRole("button", { name: "Update invoice" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(banner(page)).toHaveCount(0);
  });
});
