import { test, expect } from "@playwright/test";

/**
 * The withdrawal counts belong to whoever has to re-cover the work, which is
 * the account manager of the driver's zone. The seeded admin manages no zones,
 * so they are shown no number anywhere — a company-wide total would be a nag
 * nobody can act on.
 */

test.describe("Declined & abandoned counts (admin with no zones)", () => {
  test("no count in the sidebar and none against any week", async ({ page }) => {
    await page.goto("/work-trackers");

    // Wait for the week list itself before asserting an absence, or the test
    // passes simply because nothing has rendered yet.
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("[data-testid=sidebar-withdrawn-badge]")).toHaveCount(0);
    await expect(page.locator("[data-testid=withdrawn-badge]")).toHaveCount(0);
  });

  test("no count against any driver inside a week", async ({ page }) => {
    await page.goto("/work-trackers/2026-09-14");

    const driverRow = page.getByRole("row", { name: /Withdrawal Driver/ });
    await expect(driverRow).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid=withdrawn-badge]")).toHaveCount(0);
  });
});
