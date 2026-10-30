import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The Need attention tab of /accountant, as an accountant
 * (docs/specs/qbo-invoice-10-need-attention-tab.md §6: S1–S8; S9, an account manager and a viewer
 * who cannot open /accountant, is unchanged and stays in accountantPage.am.spec.ts and
 * accountantPage.viewer.spec.ts; S1 for an admin is in qboNeedAttention.admin.spec.ts).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). This project
 * only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts).
 *
 * The data is seeded by writing the columns of Events with the service role, as the server does after
 * a check. The database is shared, so other quotes may need attention too: every assertion looks at
 * the rows of the quotes this test made, found by their invoice numbers.
 */

const NEED_ATTENTION = "/accountant?tab=need_attention";

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

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

const searchBox = (page: Page) => page.getByPlaceholder(/^Search by name, invoice #/);
const rowOf = (page: Page, quote: CreatedQuote) =>
  page.getByRole("row").filter({ hasText: `#${quote.invoiceNumber}` });
const EMPTY = "No invoice needs attention";
const BANNER_HEADING = "The QuickBooks invoice does not match this quote.";

test.describe("Need attention tab (accountant)", () => {
  const quotes: CreatedQuote[] = [];
  const makeQuote = async () => {
    const quote = await createQuote(); // "quoted", with an invoice number and no link
    quotes.push(quote);
    return quote;
  };

  test.afterEach(async () => {
    await Promise.all(quotes.splice(0).map((quote) => cleanupQuote(quote.eventId)));
  });

  test("S1: the page has the tab Need attention, still opens on AR, and ?tab=need_attention opens it", async ({
    page,
  }) => {
    await page.goto("/accountant");
    await expect.poll(() => params(page).get("tab")).toBe("ar");
    await expect(page.getByRole("tab", { name: "Need attention" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^AR(?! Deposits)/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.goto(NEED_ATTENTION);
    await expect(page.getByRole("tab", { name: "Need attention" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("columnheader", { name: /^Reason/ })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("S2: the Reason column shows every reason of the row, comma-separated, or the generic one", async ({
    page,
  }) => {
    const one = await makeQuote();
    const two = await makeQuote();
    const none = await makeQuote();
    await updateEvent(one.eventId, needsAttention('["dates"]'));
    // Stored out of order on purpose: the column follows spec 06's order.
    await updateEvent(two.eventId, needsAttention('["totals","dates"]'));
    await updateEvent(none.eventId, needsAttention(null));
    await page.goto(NEED_ATTENTION);

    await expect(rowOf(page, one)).toContainText("Dates do not match", { timeout: 60_000 });
    await expect(rowOf(page, one)).not.toContainText("Totals do not match");
    await expect(rowOf(page, two)).toContainText("Dates do not match, Totals do not match");
    await expect(rowOf(page, none)).toContainText("Invoice does not match the quote");
  });

  test("S3: a quote with an invoice and no flag, or a flag and no invoice, is not listed", async ({
    page,
  }) => {
    const clear = await makeQuote();
    const noInvoice = await makeQuote();
    const control = await makeQuote();
    await updateEvent(clear.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    await updateEvent(noInvoice.eventId, {
      qbo_invoice_id: null,
      qbo_invoice_mismatch: true,
      qbo_invoice_mismatch_reasons: '["dates"]',
    });
    await updateEvent(control.eventId, needsAttention('["dates"]'));
    await page.goto(NEED_ATTENTION);

    // The control is listed, so the page has loaded and the other two are really absent.
    await expect(rowOf(page, control)).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(page, clear)).toHaveCount(0);
    await expect(rowOf(page, noInvoice)).toHaveCount(0);
  });

  test("S4: a quote that is no longer booked and needs attention is listed", async ({ page }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, {
      ...needsAttention('["amount"]'),
      event_status: "unsigned_changes",
    });
    await page.goto(NEED_ATTENTION);

    await expect(rowOf(page, quote)).toContainText("Amount does not match", { timeout: 60_000 });
  });

  test("S5: the tab opens newest event first; four columns sort, Reason does not", async ({
    page,
  }) => {
    const older = await makeQuote();
    const newer = await makeQuote();
    await updateEvent(older.eventId, { ...needsAttention('["dates"]'), event_start: "2026-03-01" });
    await updateEvent(newer.eventId, { ...needsAttention('["dates"]'), event_start: "2026-11-01" });
    await page.goto(NEED_ATTENTION);
    await expect(rowOf(page, older)).toBeVisible({ timeout: 60_000 });

    // The tab's own starting sort stays out of the URL.
    expect(params(page).get("sort")).toBeNull();
    const rows = await page.getByRole("row").allTextContents();
    const at = (quote: CreatedQuote) =>
      rows.findIndex((text) => text.includes(`#${quote.invoiceNumber}`));
    expect(at(newer)).toBeGreaterThan(0);
    expect(at(newer)).toBeLessThan(at(older));

    for (const [header, sort] of [
      [/^Event Name/, "event_name:asc"],
      [/^Account Manager/, "account_manager:asc"],
      [/^Start Date/, "start_date:asc"],
      [/^Invoice #/, "invoice_number:asc"],
    ] as const) {
      await page.getByRole("button", { name: header }).click();
      await expect.poll(() => params(page).get("sort")).toBe(sort);
    }
    await expect(page.getByRole("button", { name: /^Reason/ })).toHaveCount(0);
  });

  test("S6: search by event name and by invoice number narrows the list", async ({ page }) => {
    const target = await makeQuote();
    const other = await makeQuote();
    await updateEvent(target.eventId, needsAttention('["dates"]'));
    await updateEvent(other.eventId, needsAttention('["dates"]'));
    await page.goto(NEED_ATTENTION);
    await expect(rowOf(page, other)).toBeVisible({ timeout: 60_000 });

    await searchBox(page).fill(`E2E Staleness ${target.invoiceNumber}`);
    await expect(rowOf(page, target)).toBeVisible();
    await expect(rowOf(page, other)).toHaveCount(0);

    await searchBox(page).fill(`#${other.invoiceNumber}`);
    await expect(rowOf(page, other)).toBeVisible();
    await expect(rowOf(page, target)).toHaveCount(0);
  });

  test("S6: the Filter Panel narrows the list, and Show Deleted adds a deleted quote", async ({
    page,
  }) => {
    const live = await makeQuote();
    const deleted = await makeQuote();
    await updateEvent(live.eventId, needsAttention('["dates"]'));
    await updateEvent(deleted.eventId, { ...needsAttention('["dates"]'), deleted: true });

    // A deleted quote is not in the list until Show Deleted is on, and then only deleted ones are.
    await page.goto(NEED_ATTENTION);
    await expect(rowOf(page, live)).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(page, deleted)).toHaveCount(0);
    await page.getByRole("switch", { name: "Show Deleted" }).click();
    await expect.poll(() => params(page).get("showDeleted")).toBe("1");
    await expect(rowOf(page, deleted)).toBeVisible();
    await expect(rowOf(page, live)).toHaveCount(0);

    // The panel's Sales Office filter is the ?office= parameter: an office no quote belongs to
    // empties the list; the tab does not override the filter.
    await page.goto(`${NEED_ATTENTION}&office=00000000-0000-4000-8000-000000000000`);
    await expect(page.getByText(EMPTY)).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(page, live)).toHaveCount(0);
  });

  test("S7: clicking a row opens the quote, and its banner shows for an accountant", async ({
    page,
  }) => {
    const quote = await makeQuote();
    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await page.goto(NEED_ATTENTION);

    await rowOf(page, quote).click({ timeout: 60_000 });

    await expect(page).toHaveURL(new RegExp(`/quotes-bookings/${quote.eventId}`));
    await expect(page.getByRole("alert").filter({ hasText: BANNER_HEADING })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("S8: when nothing needs attention the tab says so", async ({ page }) => {
    // The database is shared, so "nothing" is a search that finds no flagged quote: this test's own
    // quote has an invoice and a clear flag, and the control sets the flag and finds it.
    const quote = await makeQuote();
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-fake-invoice" });
    await page.goto(`${NEED_ATTENTION}&q=${quote.invoiceNumber}`);

    await expect(page.getByText(EMPTY)).toBeVisible({ timeout: 60_000 });

    await updateEvent(quote.eventId, needsAttention('["dates"]'));
    await expect(rowOf(page, quote)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(EMPTY)).toHaveCount(0);
  });
});
