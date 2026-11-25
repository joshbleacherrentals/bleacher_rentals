import { test, expect } from "@playwright/test";

/**
 * The Dashboard & Analytics page as an account manager sees it: the item is not in the Quality
 * Assurance dropdown, and typing the address sends them to the landing page. An account manager
 * has /dashboard, and the path rule compares a whole segment, so /dashboard does not open it.
 * Written, not run (project rule).
 * Spec: docs/specs/dashboard-analytics-02-access-shell.md §5 (S3).
 */

const TITLE = "Dashboard & Analytics";

test.describe("Dashboard & Analytics access (account manager)", () => {
  test("S3: the item is not in the Quality Assurance dropdown", async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("sidebar");
    await sidebar.getByRole("button", { name: "Quality Assurance" }).click();

    // The dropdown is open, with the children the role may open, and not the new one.
    await expect(sidebar.getByRole("link", { name: "Damage Reports" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(sidebar.getByRole("link", { name: TITLE })).toHaveCount(0);
  });

  test("S3: typing the address sends them to the landing page", async ({ page }) => {
    // A client-side redirect may abort the navigation. That is a refusal, not an error: judge on
    // where the page ended up.
    await page.goto("/dashboard-analytics").catch(() => {});

    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 30_000,
        message: "an account manager stayed on /dashboard-analytics",
      })
      .toBe("/dashboard");
    await expect(page.getByRole("heading", { name: TITLE })).toHaveCount(0);
  });
});
