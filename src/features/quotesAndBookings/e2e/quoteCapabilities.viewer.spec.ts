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
 * The quote card and the list as a viewer sees them
 * (docs/specs/accountant-quotes-03-capabilities.md, S5, S6).
 *
 * Written, not run locally. The database half — who may write what — is asserted in the SQL
 * tests; this file only asserts which controls the pages draw.
 */

test.describe("Quote capabilities (viewer)", () => {
  test("S5: a viewer sees Open in Dashboard and nothing else to press", async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();

    await expect(openInDashboard(page)).toBeVisible();
    await expect(edit(page)).toHaveCount(0);
    await expect(remove(page)).toHaveCount(0);
    await expect(sendToClient(page)).toHaveCount(0);
    await expect(recordPayment(page)).toHaveCount(0);
  });

  test("S5: the QuickBooks Invoice checkbox is there but disabled", async ({ page }) => {
    await page.goto(BILLING);
    await expect(qboFlag(page)).toBeVisible();
    await expect(qboFlag(page)).toBeDisabled();
  });

  test("S5: the chat message stands in for the internal chat", async ({ page }) => {
    await page.goto(`${CARD}?tab=messages`);
    await expect(
      page.getByText("Internal chat is available to admins and account managers only."),
    ).toBeVisible();
  });

  test("S6: there is no + Create Quote on the list, and the list is still readable", async ({
    page,
  }) => {
    await page.goto("/quotes-bookings");
    await expect(page.getByRole("heading", { name: "Quotes & Bookings" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(createQuote(page)).toHaveCount(0);
  });
});
