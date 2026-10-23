import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * View in QuickBooks, Check again and the check time on the Billing tab, as an admin
 * (docs/specs/qbo-invoice-08-view-and-check.md §6: S1, S2, S3, S4, S5, S7).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The routes
 * reach QuickBooks, which a browser test cannot replace from outside the server, so the view route
 * and the check route are replaced by fakes (`route`) that record what the screen sent. What the
 * routes themselves do is asserted by their unit tests.
 */

const CHECK_ROUTE = "**/api/quickbooks/invoice/check";
const VIEW_ROUTE = "**/api/quickbooks/invoice/view**";

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

type FakeAnswer = { status?: number; json: unknown };

/** Replaces the check route. Returns the bodies the screen sent, in order. */
async function fakeCheckRoute(page: Page, answer: (body: any) => FakeAnswer | Promise<FakeAnswer>) {
  const sent: any[] = [];
  await page.route(CHECK_ROUTE, async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const { status = 200, json } = await answer(body);
    await route.fulfill({ status, json });
  });
  return sent;
}

const billing = (quote: CreatedQuote) => `/quotes-bookings/${quote.eventId}?tab=billing`;
const viewLink = (page: Page) => page.getByRole("link", { name: "View in QuickBooks" });
const checkButton = (page: Page) => page.getByRole("button", { name: "Check again" });
const updateButton = (page: Page) => page.getByRole("button", { name: "Update invoice" });
const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });

const MATCHING = { status: "checked", matches: true, reasons: [], differences: [] };

test.describe("View in QuickBooks, Check again and the check time (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // status "quoted", with an invoice number, no invoice
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S2: a quote with no invoice shows neither button", async ({ page }) => {
    const sent = await fakeCheckRoute(page, () => ({ json: MATCHING }));
    await page.goto(billing(quote));

    // The tab is up when the flag is: the buttons live right under it.
    await expect(qboFlag(page)).toBeVisible({ timeout: 60_000 });
    await expect(viewLink(page)).toHaveCount(0);
    await expect(checkButton(page)).toHaveCount(0);
    expect(sent).toHaveLength(0);
  });

  test.describe("a quote with an invoice", () => {
    test.beforeEach(async () => {
      // "quoted", which Create would refuse: the buttons depend on the invoice, not on the status.
      await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-linked-invoice", is_qbo: true });
    });

    test("S1 and S3: both buttons are drawn beside Update invoice, although the quote is not booked", async ({
      page,
    }) => {
      await page.goto(billing(quote));

      await expect(updateButton(page)).toBeVisible({ timeout: 60_000 });
      await expect(viewLink(page)).toBeVisible();
      await expect(checkButton(page)).toBeVisible();
    });

    test("S4: View in QuickBooks opens a new tab on the view route, and the quote page stays", async ({
      page,
      context,
    }) => {
      // The fake stands in for the redirect to QuickBooks, which a test must not follow.
      await context.route(VIEW_ROUTE, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<p>fake QuickBooks</p>" }),
      );
      await page.goto(billing(quote));
      const pageUrl = page.url();
      await expect(viewLink(page)).toBeVisible({ timeout: 60_000 });

      const [popup] = await Promise.all([page.waitForEvent("popup"), viewLink(page).click()]);

      await popup.waitForURL(`**/api/quickbooks/invoice/view?eventId=${quote.eventId}`);
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      expect(page.url()).toBe(pageUrl);
      await expect(viewLink(page)).toBeVisible();
    });

    test("S5: an equal invoice: the success toast", async ({ page }) => {
      const sent = await fakeCheckRoute(page, () => ({ json: MATCHING }));
      await page.goto(billing(quote));

      await checkButton(page).click({ timeout: 60_000 });

      await expect(page.getByText("The invoice matches the quote.")).toBeVisible();
      expect(sent).toEqual([{ eventId: quote.eventId }]);
    });

    test("S5: a different invoice: the error toast names each reason", async ({ page }) => {
      await fakeCheckRoute(page, () => ({
        json: {
          status: "checked",
          matches: false,
          reasons: ["dates"],
          differences: [
            { reason: "dates", field: "Due date", quote: "2026-11-14", qbo: "2026-11-01" },
          ],
        },
      }));
      await page.goto(billing(quote));

      await checkButton(page).click({ timeout: 60_000 });

      await expect(
        page.getByText("Dates do not match — Due date: QuickBooks 2026-11-01, quote 2026-11-14."),
      ).toBeVisible();
    });

    test("S5: invoice_missing and skipped show their message", async ({ page }) => {
      let n = 0;
      await fakeCheckRoute(page, () =>
        n++ === 0
          ? { json: { status: "invoice_missing" } }
          : { json: { status: "skipped", message: "This quote has no venue street yet." } },
      );
      await page.goto(billing(quote));

      await checkButton(page).click({ timeout: 60_000 });
      await expect(page.getByText("The invoice was not found in QuickBooks.")).toBeVisible();

      await checkButton(page).click();
      await expect(page.getByText("This quote has no venue street yet.")).toBeVisible();
    });

    test("S5: a route error shows its message, and the button can be pressed again", async ({
      page,
    }) => {
      await fakeCheckRoute(page, () => ({
        status: 502,
        json: { error: "QuickBooks could not be reached." },
      }));
      await page.goto(billing(quote));

      await checkButton(page).click({ timeout: 60_000 });

      await expect(page.getByText("QuickBooks could not be reached.")).toBeVisible();
      await expect(checkButton(page)).toBeEnabled();
    });

    test("S5: the button is busy while the check runs and cannot be pressed again", async ({
      page,
    }) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const sent = await fakeCheckRoute(page, async () => {
        await gate;
        return { json: MATCHING };
      });
      await page.goto(billing(quote));

      await checkButton(page).click({ timeout: 60_000 });

      const busy = page.getByRole("button", { name: "Checking…" });
      await expect(busy).toBeDisabled();
      release();
      await expect(page.getByText("The invoice matches the quote.")).toBeVisible();
      await expect(checkButton(page)).toBeEnabled();
      expect(sent).toHaveLength(1);
    });

    test("S7: a quote never checked says 'Not checked yet'", async ({ page }) => {
      await page.goto(billing(quote));

      await expect(page.getByText("Not checked yet")).toBeVisible({ timeout: 60_000 });
    });

    test("S7: a quote that was checked says when", async ({ page }) => {
      await updateEvent(quote.eventId, { qbo_invoice_checked_at: "2026-10-23T14:05:00.000Z" });
      await page.goto(billing(quote));

      await expect(page.getByText(/^Checked \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("Not checked yet")).toHaveCount(0);
    });

    test("S7: a quote whose last attempt failed shows the red line, and Check again clears it without a reload", async ({
      page,
    }) => {
      await updateEvent(quote.eventId, {
        qbo_invoice_checked_at: "2026-10-23T14:05:00.000Z",
        qbo_invoice_check_failed_at: "2026-10-23T14:30:00.000Z",
      });
      // The fake does what the real route does on a success: the check time passes the failure
      // time, and the failure time is cleared.
      await fakeCheckRoute(page, async (body) => {
        await updateEvent(body.eventId, {
          qbo_invoice_checked_at: new Date().toISOString(),
          qbo_invoice_check_failed_at: null,
        });
        return { json: MATCHING };
      });
      await page.goto(billing(quote));

      const failed = page.getByText(/^The last check failed \(.+\)\. Press Check again\.$/);
      await expect(failed).toBeVisible({ timeout: 60_000 });
      await expect(failed).toHaveClass(/text-red/);
      await expect(page.getByText(/^Last successful check /)).toBeVisible();

      await checkButton(page).click();

      await expect(failed).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByText(/^Checked \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
    });
  });
});
