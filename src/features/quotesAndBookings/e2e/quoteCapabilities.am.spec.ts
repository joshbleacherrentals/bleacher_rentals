import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const CARD = `/quotes-bookings/${QUOTE}`;
const BILLING = `${CARD}?tab=billing`;

const openInDashboard = (page: Page) => page.getByRole("button", { name: "Open in Dashboard" });
const edit = (page: Page) => page.getByRole("button", { name: "Edit", exact: true });
// The delete button is an icon with no text.
const remove = (page: Page) => page.locator('button:has(svg[class*="lucide-trash"])');
const sendToClient = (page: Page) => page.getByRole("button", { name: "Send To Client" });
const recordPayment = (page: Page) => page.getByRole("button", { name: "+ Record Payment" });
const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });
const createQuote = (page: Page) => page.getByRole("button", { name: "+ Create Quote" });

/**
 * The quote card and the list as an account manager sees them
 * (docs/specs/accountant-quotes-03-capabilities.md, S2, S3, S4, S6).
 *
 * Written, not run locally. The database half — who may write what — is asserted in the SQL
 * tests; this file only asserts which controls the pages draw.
 */

test.describe("Quote capabilities (account manager)", () => {
  // The seeded E2E account manager is a lead (see recordPayment.am.spec.ts), so this project
  // exercises S2 and not S3.
  test("S2: a lead sees Edit and Delete on a quote they did not create, and can record a payment", async ({
    page,
  }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();

    await expect(edit(page)).toBeVisible();
    await expect(remove(page)).toBeVisible();
    await expect(sendToClient(page)).toBeVisible();
    await expect(recordPayment(page)).toBeEnabled();
    await expect(qboFlag(page)).toBeEnabled();
  });

  test("S6: + Create Quote is on the list", async ({ page }) => {
    await page.goto("/quotes-bookings");
    await expect(createQuote(page)).toBeVisible({ timeout: 60_000 });
  });

  // S3 and S4 need a second, non-lead account manager, and a quote one of them created; the seed
  // has neither. Both are pinned in getQuotesBookingsCapabilities.test.ts, where lead status and
  // ownership are inputs rather than fixtures.
  test.fixme("S3: a junior on someone else's quote has no Edit or Delete, Record Payment disabled with its hint", async () => {});
  test.fixme("S4: a junior on their own quote sees Edit and Delete", async () => {});
});
