import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The QuickBooks invoice banner on the quote card, as an accountant
 * (docs/specs/qbo-invoice-09-banner.md §6: S1, S2, S3, S4, S6, S7 and S8; S5, an admin who is not an
 * accountant, is in qboInvoiceBanner.admin.spec.ts).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * The data is seeded by writing the columns of Events with the service role, as the server does after
 * a check. S8 replaces the Update route with a fake that clears the flag, as the real route's check
 * does: what the real route reaches (QuickBooks) cannot be replaced from the browser.
 */

const INVOICE_ROUTE = "**/api/quickbooks/invoice";

const HEADING = "The QuickBooks invoice does not match this quote.";
const DATES = "The invoice date or the due date in QuickBooks does not match this quote.";
const TOTALS = "QuickBooks' total or tax does not match this quote's.";
const CLOSING =
  "Press Update invoice on the Billing tab, or correct the invoice in QuickBooks and press Check again.";

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

/** A quote with an invoice, whose last check found a difference. */
const needsAttention = (reasons: string | null) => ({
  qbo_invoice_id: "e2e-fake-invoice",
  qbo_invoice_mismatch: true,
  qbo_invoice_mismatch_reasons: reasons,
});

const banner = (page: Page) => page.getByRole("alert").filter({ hasText: HEADING });
const quoteHeading = (page: Page, quote: CreatedQuote) =>
  page.getByRole("heading", { level: 1 }).filter({ hasText: String(quote.invoiceNumber) });

test.describe("QuickBooks invoice banner (accountant)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // "quoted", with an invoice number and no link
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: a quote whose flag is false has no banner, and it appears when a check sets the flag", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_mismatch: false,
    });
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(quoteHeading(page, quote)).toBeVisible({ timeout: 60_000 });
    await expect(banner(page)).toHaveCount(0);

    // The control: the page is live, so a flag set now reaches it.
    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await expect(banner(page)).toBeVisible({ timeout: 60_000 });
  });

  test("S2: the flag set with the reasons [dates]: the heading, the dates line and the closing line", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(banner(page)).toBeVisible({ timeout: 60_000 });
    await expect(banner(page).getByText(HEADING, { exact: true })).toBeVisible();
    await expect(banner(page).getByRole("listitem")).toHaveText([DATES]);
    await expect(banner(page).getByText(CLOSING, { exact: true })).toBeVisible();
  });

  test("S3: the reasons [dates, totals]: both lines, in that order", async ({ page }) => {
    // Stored out of order on purpose: the banner follows spec 06's order.
    await updateEvent(quote.eventId, needsAttention('["totals","dates"]'));
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(banner(page)).toBeVisible({ timeout: 60_000 });
    await expect(banner(page).getByRole("listitem")).toHaveText([DATES, TOTALS]);
  });

  test("S4: the flag set and no reasons: the generic line", async ({ page }) => {
    await updateEvent(quote.eventId, needsAttention(null));
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(banner(page)).toBeVisible({ timeout: 60_000 });
    await expect(banner(page).getByRole("listitem")).toHaveText([HEADING]);
    await expect(banner(page).getByText(CLOSING, { exact: true })).toBeVisible();
  });

  test("S6: a set flag on a quote with no invoice: no banner", async ({ page }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: null,
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates"]',
    });
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(quoteHeading(page, quote)).toBeVisible({ timeout: 60_000 });
    await expect(banner(page)).toHaveCount(0);

    // The control: once the quote has an invoice, the same flag is a banner.
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    await expect(banner(page)).toBeVisible({ timeout: 60_000 });
  });

  test("S7: a deleted quote that needs attention has no banner, only its own notice", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { ...needsAttention('["dates"]'), deleted: true });
    await page.goto(`/quotes-bookings/${quote.eventId}`);

    await expect(page.getByText("This quote was deleted")).toBeVisible({ timeout: 60_000 });
    await expect(banner(page)).toHaveCount(0);
  });

  test("S8: after Update invoice the banner disappears without a reload", async ({ page }) => {
    await updateEvent(quote.eventId, { ...needsAttention('["dates"]'), is_qbo: true });

    // The fake does what the real route's check does when the invoice now equals the quote.
    await page.route(INVOICE_ROUTE, async (route) => {
      const { eventId } = route.request().postDataJSON();
      await updateEvent(eventId, {
        qbo_invoice_mismatch: false,
        qbo_invoice_mismatch_reasons: null,
        qbo_invoice_checked_at: new Date().toISOString(),
      });
      await route.fulfill({
        json: {
          status: "updated",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: "e2e-fake-invoice",
          linkedExisting: false,
          warnings: [],
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
    await expect(banner(page)).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Update invoice" }).click();
    await page
      .getByRole("alertdialog")
      .or(page.getByRole("dialog"))
      .getByRole("button", { name: "Update invoice" })
      .click();

    await expect(page.getByText(`Invoice ${quote.invoiceNumber} updated`)).toBeVisible();
    await expect(banner(page)).toHaveCount(0, { timeout: 60_000 });
  });
});
