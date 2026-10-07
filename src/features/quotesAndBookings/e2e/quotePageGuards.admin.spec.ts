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
 * An admin on the two form pages and on Delete
 * (docs/specs/accountant-quotes-04-accountant-quote-access.md, S5, S6 and S8).
 *
 * Written, not run locally.
 */

test.describe("Quote form pages (admin)", () => {
  test("S5: /quotes-bookings/new opens the form", async ({ page }) => {
    await page.goto("/quotes-bookings/new");
    await expect(page.getByRole("heading", { name: /quote/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    expect(path(page)).toBe("/quotes-bookings/new");
  });

  test("S6: the edit page opens the form", async ({ page }) => {
    await page.goto(`${CARD}/edit`);
    await expect(page.getByText("Loading quote...")).toHaveCount(0, { timeout: 60_000 });
    expect(path(page)).toBe(`${CARD}/edit`);
  });

  // S8 — deleting a quote goes back to the previous page — needs a quote made for the purpose; the
  // seeded one is shared by every other spec. The move itself is useGoBackOrTo's, pinned in its
  // test.
  test.fixme("S8: deleting a quote returns to the previous page", async () => {});
});
