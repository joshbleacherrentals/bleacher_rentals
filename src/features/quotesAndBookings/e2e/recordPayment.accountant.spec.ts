import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two $2,700 installments, the first already paid
// by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;

/**
 * The accountant records manual payments from the Billing tab
 * (docs/specs/accountant-quotes-10-accountant-writes-payments.md §5, S1 and S4).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts); it needs a Clerk accountant user with a seeded Users + Accountants row.
 * The database half — what the accountant may insert, and what is refused — is asserted in
 * supabase/tests/accountant_writes_payments.test.sql; this file asserts what the screen shows.
 */

const row = (page: Page, text: string | RegExp) =>
  page.getByRole("row", { name: /Payment details for .*/ }).filter({ hasText: text });

test.describe("Record Payment (accountant)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("S1: + Record Payment is there, and a recorded check names the accountant under Recorded by", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "+ Record Payment" })).toBeVisible();
    await page.getByRole("button", { name: "+ Record Payment" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByLabel(/^Amount/).fill("15.00");
    await page.getByLabel("Check #").fill("ACCT-S1");
    await page.getByRole("button", { name: "Record Payment", exact: true }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "ACCT-S1")).toBeVisible();

    // The author is the accountant: not Stripe, and not the "Staff" fallback the tab prints when it
    // cannot find the user's name.
    await row(page, "ACCT-S1").click();
    const author = page.getByRole("dialog").getByText("Recorded by").locator("..");
    await expect(author).not.toContainText("Staff");
    await expect(author).not.toContainText("Stripe");
  });

  // S4 — recording on a quote that was never booked and on a deleted event (D1: any event) — needs
  // those fixtures; the seed has neither. The rule is asserted in the SQL test, which inserts, edits
  // and soft-deletes on a quoted event and on a deleted one.
  test.fixme("S4: an accountant can record a payment on a quote that is not booked and on a deleted event", async () => {});
});
