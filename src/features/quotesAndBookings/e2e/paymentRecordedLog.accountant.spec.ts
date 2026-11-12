import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const INVOICE = `/accountant/invoice?id=${QUOTE}`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * An accountant records a payment on the invoice page and the quote's Log has the row
 * (docs/specs/event-change-log-01-payment-recorded.md §4, S2).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts). The invoice page and the Billing tab open the same RecordPaymentDialog, so
 * the row is written by the same function; what is asserted here is that it reaches the Log of the
 * quote for a role that is not an admin. The paid date is typed, so the text does not depend on the
 * day the suite runs.
 */

const PAID_DATE = "2026-08-14";
const PAID_TEXT = "Aug 14, 2026";

const logRow = (page: Page, text: string | RegExp) =>
  page.getByRole("button").filter({ hasText: text });

test.describe("Payment recorded in the Log (accountant)", () => {
  test("S2: a payment recorded on the invoice page is on the quote's Log", async ({ page }) => {
    await page.goto(INVOICE);
    await page.getByRole("button", { name: "Record Payment", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Check", exact: true }).click();
    await dialog.getByLabel(/^Amount/).fill("27.43");
    await dialog.getByLabel("Date Received").fill(PAID_DATE);
    await dialog.getByLabel("Check #").fill("ACCT-LOG-S2");
    await dialog.getByRole("button", { name: "Record Payment", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto(LOG);
    const recorded = logRow(page, `Payment recorded: $27.43 · Check · ${PAID_TEXT}`).first();
    await expect(recorded).toBeVisible({ timeout: 60_000 });
    // The author is the accountant, not the "System" of a row with nobody behind it.
    await expect(recorded).not.toContainText("System");
  });
});
