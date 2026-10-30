import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The sidebar counts, the tab-label counts and the row marks as an admin who is not an accountant
 * (docs/specs/qbo-invoice-11-counts-and-marks.md §6, S2: they see none of them; the scenarios as an
 * accountant are in qboInvoiceCounts.accountant.spec.ts).
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

test.describe("QuickBooks invoice counts and marks (admin who is not an accountant)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote();
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates","totals"]',
    });
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S2: no sidebar count, no tab number and no mark, though the quote needs attention", async ({
    page,
  }) => {
    // The Need attention tab lists the quote (it is the admin's to open), which also tells us the
    // page has loaded and the row sync has finished.
    await page.goto("/accountant?tab=need_attention");
    await expect(
      page.getByRole("row").filter({ hasText: `#${quote.invoiceNumber}` }),
    ).toContainText("Dates do not match, Totals do not match", { timeout: 60_000 });

    await expect(page.getByTestId("sidebar-invoice-attention-badge")).toHaveCount(0);
    await expect(page.getByTestId("accountant-tab-count-ar")).toHaveCount(0);
    await expect(page.getByTestId("accountant-tab-count-ar-deposits")).toHaveCount(0);
    await expect(page.getByTestId("accountant-tab-count-need-attention")).toHaveCount(0);
    await expect(page.getByTestId("invoice-attention-mark")).toHaveCount(0);

    await page.goto(`/quotes-bookings?q=${quote.invoiceNumber}`);
    await expect(page.getByRole("row").filter({ hasText: `#${quote.invoiceNumber}` })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("invoice-attention-mark")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-invoice-attention-badge")).toHaveCount(0);
  });
});
