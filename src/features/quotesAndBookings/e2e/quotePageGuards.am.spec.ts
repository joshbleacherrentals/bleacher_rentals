import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const CARD = `/quotes-bookings/${QUOTE}`;

/** The URL's path, without waiting for the page to load. */
const path = (page: Page) => new URL(page.url()).pathname;

const edit = (page: Page) => page.getByRole("button", { name: "Edit", exact: true });
// The delete button is an icon with no text.
const remove = (page: Page) => page.locator('button:has(svg[class*="lucide-trash"])');

/**
 * An account manager on the two form pages
 * (docs/specs/accountant-quotes-04-accountant-quote-access.md, S5 and S6).
 *
 * Written, not run locally. The seeded E2E account manager is a lead (see
 * recordPayment.am.spec.ts), so this project exercises the lead case of S6.
 */

test.describe("Quote form pages (account manager)", () => {
  test("S5: /quotes-bookings/new opens the form", async ({ page }) => {
    await page.goto("/quotes-bookings/new");
    await expect(page.getByRole("heading", { name: /quote/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    expect(path(page)).toBe("/quotes-bookings/new");
  });

  test("S6: a lead opens the edit form of a quote they did not create", async ({ page }) => {
    await page.goto(`${CARD}/edit`);
    await expect(page.getByText("Loading quote...")).toHaveCount(0, { timeout: 60_000 });
    expect(path(page)).toBe(`${CARD}/edit`);
  });

  // A junior account manager on someone else's quote is sent to the card, and on their own quote
  // opens the form — both need a second, non-lead account manager that the seed does not have.
  // Pinned in quotePageGuard.test.ts, where lead status and ownership are inputs.
  test.fixme("S6: a junior on someone else's quote is sent to the card", async () => {});
  test.fixme("S6: a junior on their own quote opens the form", async () => {});
});
