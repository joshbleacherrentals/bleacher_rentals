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
 * The quote card and the list as an admin sees them
 * (docs/specs/accountant-quotes-03-capabilities.md, S1, S6, S7).
 *
 * Written, not run locally. The database half — who may write what — is asserted in the SQL
 * tests; this file only asserts which controls the pages draw.
 */

test.describe("Quote capabilities (admin)", () => {
  test("S1: every action is visible and enabled on a quote", async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();

    await expect(openInDashboard(page)).toBeVisible();
    await expect(edit(page)).toBeVisible();
    await expect(remove(page)).toBeVisible();
    await expect(sendToClient(page)).toBeVisible();
    await expect(recordPayment(page)).toBeEnabled();
    await expect(qboFlag(page)).toBeEnabled();
  });

  test("S1: the internal chat is there, not the message that stands in for it", async ({
    page,
  }) => {
    await page.goto(`${CARD}?tab=messages`);

    await expect(page.getByRole("tab", { name: "Internal" })).toBeVisible();
    await expect(
      page.getByText("Internal chat is available to admins and account managers only."),
    ).toHaveCount(0);
  });

  test("S6: + Create Quote is on the list", async ({ page }) => {
    await page.goto("/quotes-bookings");
    await expect(createQuote(page)).toBeVisible({ timeout: 60_000 });
  });

  // S7 — a deleted quote shows no action buttons for any role — needs a soft-deleted quote, and
  // the seed has none. The rule is pinned in QuoteActionBar.test.tsx.
  test.fixme("S7: a deleted quote has no action buttons", async () => {});
});
