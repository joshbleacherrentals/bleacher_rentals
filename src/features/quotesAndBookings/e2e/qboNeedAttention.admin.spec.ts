import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The Need attention tab of /accountant as an admin who is not an accountant
 * (docs/specs/qbo-invoice-10-need-attention-tab.md §6, S1 and the decision of §1: an admin sees the
 * tab and its list, but not the signals of specs 09 and 11). The other scenarios are in
 * qboNeedAttention.accountant.spec.ts.
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

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

const BANNER_HEADING = "The QuickBooks invoice does not match this quote.";

test.describe("Need attention tab (admin who is not an accountant)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote();
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: the page has the tab, still opens on AR, and ?tab=need_attention lists the quote", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates","totals"]',
    });

    await page.goto("/accountant");
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    await expect(page.getByRole("tab", { name: "Need attention" })).toBeVisible();

    await page.goto("/accountant?tab=need_attention");
    const row = page.getByRole("row").filter({ hasText: `#${quote.invoiceNumber}` });
    await expect(row).toContainText("Dates do not match, Totals do not match", {
      timeout: 60_000,
    });
  });

  test("S1: opening the quote from the tab shows no banner — the signals are accountants' only", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates"]',
    });
    await page.goto("/accountant?tab=need_attention");

    await page
      .getByRole("row")
      .filter({ hasText: `#${quote.invoiceNumber}` })
      .click({ timeout: 60_000 });

    await expect(page).toHaveURL(new RegExp(`/quotes-bookings/${quote.eventId}`));
    // The Update button reads the same local row as the banner would: once it is drawn, the row is in.
    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
    await expect(page.getByRole("button", { name: "Update invoice" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("alert").filter({ hasText: BANNER_HEADING })).toHaveCount(0);
  });
});
