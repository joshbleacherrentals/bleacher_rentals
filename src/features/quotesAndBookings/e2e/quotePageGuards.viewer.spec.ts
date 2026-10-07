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
 * A viewer on the two form pages (docs/specs/accountant-quotes-04-accountant-quote-access.md, S5
 * and S6): today they open the form and the save is refused; now they never see it.
 *
 * Written, not run locally.
 */

test.describe("Quote form pages (viewer)", () => {
  test("S5: /quotes-bookings/new sends a viewer back to the list", async ({ page }) => {
    await page.goto("/quotes-bookings/new").catch(() => {});
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe("/quotes-bookings");
  });

  test("S6: the edit page sends a viewer to the card", async ({ page }) => {
    await page.goto(`${CARD}/edit`).catch(() => {});
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe(CARD);
  });
});
