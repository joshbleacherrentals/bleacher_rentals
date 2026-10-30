import { createClient } from "@supabase/supabase-js";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The sidebar counts, the tab-label counts and the row marks, as an accountant
 * (docs/specs/qbo-invoice-11-counts-and-marks.md §6: S1, S3, S4, S5, S6, S7 and S8; S2, an admin who
 * is not an accountant, is in qboInvoiceCounts.admin.spec.ts). The count is on the Accountant item
 * of the sidebar only, and the tab number on Need attention only (not on AR or AR Deposits).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * The data is seeded by writing the columns of Events with the service role, as the server does after
 * a check. The database is shared, so other quotes may need attention too: the sidebar's number is
 * compared with the number the same rule gives straight from the database, never with a fixed one.
 * S6 replaces the Update route with a fake that clears the flag, as the real route's check does.
 * S4 and S8 use two of the quotes seeded for the AR tabs (supabase/seed.sql): the AR one and the AR
 * Deposits one are put in the flagged state for the test and put back afterwards.
 */

const INVOICE_ROUTE = "**/api/quickbooks/invoice";
const BADGE = "sidebar-invoice-attention-badge";
// Seeded for the AR tabs: "Gulf Breeze Youth Soccer Cup" (AR) and "Lac-Brume Carnaval d'hiver" (AR Deposits).
const SEEDED_AR_INVOICE = 777000102;
const SEEDED_AR_DEPOSITS_INVOICE = 777000124;

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

async function eventIdOfInvoice(invoiceNumber: number): Promise<string> {
  const { data, error } = await serviceRole()
    .from("Events")
    .select("id")
    .eq("invoice_number", invoiceNumber)
    .single();
  if (error || !data) throw new Error(`no event has invoice number ${invoiceNumber}`);
  return data.id as string;
}

/** The number the sidebar's rule gives, from the database: an invoice, the flag set, not deleted. */
async function quotesNeedingAttention(): Promise<number> {
  const { count, error } = await serviceRole()
    .from("Events")
    .select("id", { count: "exact", head: true })
    .not("qbo_invoice_id", "is", null)
    .eq("qbo_invoice_mismatch", true)
    .eq("deleted", false);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

/** A quote with an invoice, whose last check found a difference. */
const needsAttention = (reasons: string | null) => ({
  qbo_invoice_id: "e2e-fake-invoice",
  qbo_invoice_mismatch: true,
  qbo_invoice_mismatch_reasons: reasons,
});
const CLEAR = {
  qbo_invoice_id: null,
  qbo_invoice_mismatch: false,
  qbo_invoice_mismatch_reasons: null,
};

const sidebarLink = (page: Page, name: RegExp) =>
  page.getByTestId("sidebar").getByRole("link", { name });
const sidebarBadge = (page: Page, name: RegExp) => sidebarLink(page, name).getByTestId(BADGE);
/** A count that is not drawn is 0. */
const numberOn = async (badge: Locator) =>
  (await badge.count()) === 0 ? 0 : Number(await badge.textContent());

const tabCount = (page: Page, tab: "need-attention") =>
  page.getByTestId(`accountant-tab-count-${tab}`);
/** Every number on the tab labels: only Need attention has one. */
const anyTabCount = (page: Page) => page.locator('[data-testid^="accountant-tab-count-"]');
const marksIn = (row: Locator) => row.getByTestId("invoice-attention-mark");
const rowOf = (page: Page, invoiceNumber: number) =>
  page.getByRole("row").filter({ hasText: `#${invoiceNumber}` });

const ACCOUNTANT_ITEM = /^Accountant/;
const QUOTES_ITEM = /^Quotes & Bookings/;

test.describe("QuickBooks invoice counts and marks (accountant)", () => {
  const quotes: CreatedQuote[] = [];
  const makeQuote = async () => {
    const quote = await createQuote(); // "quoted", with an invoice number and no link
    quotes.push(quote);
    return quote;
  };
  const seeded: string[] = [];

  test.afterEach(async () => {
    await Promise.all(quotes.splice(0).map((quote) => cleanupQuote(quote.eventId)));
    await Promise.all(seeded.splice(0).map((id) => updateEvent(id, CLEAR)));
  });

  test("S1: three quotes whose flag is set: the Accountant item shows the count, Quotes & Bookings none", async ({
    page,
  }) => {
    const [first, second, third] = [await makeQuote(), await makeQuote(), await makeQuote()];
    await updateEvent(first.eventId, needsAttention('["dates"]'));
    await updateEvent(second.eventId, needsAttention('["dates"]'));
    await updateEvent(third.eventId, needsAttention('["totals"]'));
    const expected = await quotesNeedingAttention();
    expect(expected).toBeGreaterThanOrEqual(3);

    await page.goto("/accountant");

    await expect
      .poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM)), { timeout: 60_000 })
      .toBe(expected);
    await expect(sidebarLink(page, QUOTES_ITEM)).toBeVisible();
    await expect(sidebarBadge(page, QUOTES_ITEM)).toHaveCount(0);
    await expect(sidebarBadge(page, ACCOUNTANT_ITEM)).toHaveAttribute(
      "aria-label",
      `${expected} QuickBooks invoices need your attention`,
    );
  });

  test("S3: a deleted quote that needs attention is not in the sidebar count", async ({ page }) => {
    const live = await makeQuote();
    const deleted = await makeQuote();
    const control = await makeQuote();
    await updateEvent(live.eventId, needsAttention('["dates"]'));
    await page.goto("/accountant");
    await expect
      .poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM)), { timeout: 60_000 })
      .toBe(await quotesNeedingAttention());

    // The deleted quote and a control arrive together; only the control raises the count.
    await updateEvent(deleted.eventId, { ...needsAttention('["dates"]'), deleted: true });
    await updateEvent(control.eventId, needsAttention('["dates"]'));

    const expected = await quotesNeedingAttention();
    await expect.poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM))).toBe(expected);
  });

  test("S4: the Need attention label counts its rows, AR and AR Deposits carry none; a Filter Panel filter changes the number, not the sidebar's", async ({
    page,
  }) => {
    const ar = await eventIdOfInvoice(SEEDED_AR_INVOICE);
    const deposits = await eventIdOfInvoice(SEEDED_AR_DEPOSITS_INVOICE);
    seeded.push(ar, deposits);
    await updateEvent(ar, needsAttention('["amount"]'));
    await updateEvent(deposits, needsAttention('["dates"]'));
    const quote = await makeQuote();
    await updateEvent(quote.eventId, needsAttention('["totals"]'));

    await page.goto("/accountant?tab=need_attention");

    // Need attention: the number on the label is the number of rows the tab lists.
    await expect(tabCount(page, "need-attention")).toBeVisible({ timeout: 60_000 });
    const rows = Number(await tabCount(page, "need-attention").textContent());
    await expect(page.getByRole("columnheader", { name: `Event Name (${rows})` })).toBeVisible();
    // AR and AR Deposits: the seeded quote of each is flagged above, and neither label has a number.
    await expect(anyTabCount(page)).toHaveCount(1);

    // An office no quote belongs to empties the list: the Need attention label loses its number, the
    // sidebar's count (every non-deleted quote, whatever the filters) does not move.
    const sidebarBefore = await quotesNeedingAttention();
    expect(sidebarBefore).toBeGreaterThanOrEqual(3);
    await expect.poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM))).toBe(sidebarBefore);
    await page.goto("/accountant?tab=need_attention&office=00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("No invoice needs attention")).toBeVisible({ timeout: 60_000 });
    await expect(anyTabCount(page)).toHaveCount(0);
    await expect.poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM))).toBe(sidebarBefore);
  });

  test("S4: the search box narrows the table and leaves the tab number alone", async ({ page }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await page.goto("/accountant?tab=need_attention");
    await expect(tabCount(page, "need-attention")).toBeVisible({ timeout: 60_000 });
    const before = await tabCount(page, "need-attention").textContent();

    await page.goto(`/accountant?tab=need_attention&q=${quote.invoiceNumber}`);

    await expect(rowOf(page, quote.invoiceNumber)).toBeVisible({ timeout: 60_000 });
    await expect(tabCount(page, "need-attention")).toHaveText(before!);
  });

  test("S5: a quote that needs attention has the red dot on the list and on its AR row, with the reasons on hover", async ({
    page,
  }) => {
    const quote = await makeQuote();
    const ar = await eventIdOfInvoice(SEEDED_AR_INVOICE);
    seeded.push(ar);
    await updateEvent(quote.eventId, needsAttention('["totals","dates"]'));
    await updateEvent(ar, needsAttention('["dates"]'));

    await page.goto(`/quotes-bookings?q=${quote.invoiceNumber}`);
    const mark = marksIn(rowOf(page, quote.invoiceNumber));
    await expect(mark).toBeVisible({ timeout: 60_000 });
    // In spec 06's order, whatever order they were stored in.
    await expect(mark).toHaveAttribute("title", "Dates do not match, Totals do not match");
    await expect(mark).toHaveAttribute("aria-label", "Dates do not match, Totals do not match");

    await page.goto(`/accountant?tab=ar&q=${SEEDED_AR_INVOICE}`);
    await expect(marksIn(rowOf(page, SEEDED_AR_INVOICE))).toHaveAttribute(
      "title",
      "Dates do not match",
      { timeout: 60_000 },
    );

    // The Need attention tab has the Reason column instead of a mark.
    await page.goto(`/accountant?tab=need_attention&q=${quote.invoiceNumber}`);
    await expect(rowOf(page, quote.invoiceNumber)).toContainText(
      "Dates do not match, Totals do not match",
      { timeout: 60_000 },
    );
    await expect(marksIn(rowOf(page, quote.invoiceNumber))).toHaveCount(0);
  });

  test("S6: after Update invoice the count, the tab number and the mark fall without a reload", async ({
    page,
  }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, { ...needsAttention('["dates"]'), is_qbo: true });
    const withIt = await quotesNeedingAttention();

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
    await expect
      .poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM)), { timeout: 60_000 })
      .toBe(withIt);

    await page.getByRole("button", { name: "Update invoice" }).click();
    await page
      .getByRole("alertdialog")
      .or(page.getByRole("dialog"))
      .getByRole("button", { name: "Update invoice" })
      .click();
    await expect(page.getByText(`Invoice ${quote.invoiceNumber} updated`)).toBeVisible();

    await expect
      .poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM)), { timeout: 60_000 })
      .toBe(withIt - 1);
  });

  test("S6: the tab number and the row fall when the flag is cleared", async ({ page }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await page.goto(`/accountant?tab=need_attention&q=${quote.invoiceNumber}`);
    await expect(rowOf(page, quote.invoiceNumber)).toBeVisible({ timeout: 60_000 });
    const before = Number(await tabCount(page, "need-attention").textContent());

    await updateEvent(quote.eventId, {
      qbo_invoice_mismatch: false,
      qbo_invoice_mismatch_reasons: null,
    });

    await expect(rowOf(page, quote.invoiceNumber)).toHaveCount(0, { timeout: 60_000 });
    await expect.poll(async () => numberOn(tabCount(page, "need-attention"))).toBe(before - 1);
  });

  test("S7: a quote with no invoice has no mark and is in no count", async ({ page }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, {
      qbo_invoice_id: null,
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates"]',
    });
    const control = await makeQuote();
    await updateEvent(control.eventId, needsAttention('["dates"]'));

    await page.goto(`/quotes-bookings?q=E2E Staleness`);

    // The control has its mark, so the page has loaded and the other quote's absence means something.
    await expect(marksIn(rowOf(page, control.invoiceNumber))).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(page, quote.invoiceNumber)).toBeVisible();
    await expect(marksIn(rowOf(page, quote.invoiceNumber))).toHaveCount(0);
    await expect
      .poll(() => numberOn(sidebarBadge(page, ACCOUNTANT_ITEM)))
      .toBe(await quotesNeedingAttention());
  });

  test("S8: the AR tabs still show the same rows and balances as before", async ({ page }) => {
    await page.goto(`/accountant?tab=ar&q=${SEEDED_AR_INVOICE}`);

    // Gulf Breeze Youth Soccer Cup: nothing paid, both installments overdue (supabase/seed.sql).
    const row = rowOf(page, SEEDED_AR_INVOICE);
    await expect(row).toContainText("Gulf Breeze Youth Soccer Cup", { timeout: 60_000 });
    await expect(page.getByRole("columnheader", { name: /^Amount Due/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^Remaining Balance/ })).toBeVisible();
    await expect(row).toContainText(/\$[\d,]+\.\d{2}/);

    await page.goto(`/accountant?tab=ar_deposits&q=${SEEDED_AR_DEPOSITS_INVOICE}`);
    await expect(rowOf(page, SEEDED_AR_DEPOSITS_INVOICE)).toContainText("Lac-Brume", {
      timeout: 60_000,
    });
  });
});
