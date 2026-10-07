import { test, expect, type Page } from "@playwright/test";

/**
 * A viewer and the Accountant page (docs/specs/accountant-quotes-02-accountant-page.md,
 * S6 and S7): they lose the AR tabs, and /quotes-bookings is All Events with no tab bar.
 *
 * Written, not run locally.
 */

const ACCOUNTANT = "/accountant";

/** The URL's query parameters, without waiting for the list to load. */
const params = (page: Page) => new URL(page.url()).searchParams;

const searchBox = (page: Page) => page.getByPlaceholder(/^Search by name, invoice #/);

test.describe("Accountant page (viewer)", () => {
  test("S6: /accountant sends a viewer to their landing page, and /quotes-bookings has no tab bar or Accountant entry", async ({
    page,
  }) => {
    // A client-side redirect aborts the navigation. That is a refusal, not an error.
    await page.goto(ACCOUNTANT).catch(() => {});
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto("/quotes-bookings");
    await expect(page.getByText("Subtotal")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByTestId("sidebar").getByText("Accountant", { exact: true })).toHaveCount(
      0,
    );
  });

  test("S7: an old /quotes-bookings?tab=ar opens All Events, and the first write removes ?tab", async ({
    page,
  }) => {
    await page.goto("/quotes-bookings?tab=ar");

    await expect(page.getByText("Subtotal")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect.poll(() => params(page).get("tab")).toBeNull();
  });
});
