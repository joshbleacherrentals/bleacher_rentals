import { test, expect } from "@playwright/test";

/**
 * The red counts of trackers a driver declined or abandoned.
 *
 * The seed puts one declined, one abandoned and one *cancelled* tracker on a
 * driver who shares Zone 1 with the E2E AM, in the week of 2026-09-14. The
 * cancelled one is the office calling a job off, so every count here is 2 and
 * never 3 — that is the distinction the two new statuses exist for.
 */

const WEEK_START = "2026-09-14";

test.describe("Declined & abandoned counts (account manager)", () => {
  test("the sidebar counts every withdrawal in my zones, for all time", async ({ page }) => {
    await page.goto("/work-trackers");

    await expect(page.locator("[data-testid=sidebar-withdrawn-badge]")).toHaveText("2", {
      timeout: 30_000,
    });
  });

  test("each week carries the count of the withdrawals in that week", async ({ page }) => {
    await page.goto("/work-trackers");

    const weekRow = page.getByRole("row", { name: /September 14/ });
    await expect(weekRow).toBeVisible({ timeout: 30_000 });
    await expect(weekRow.locator("[data-testid=withdrawn-badge]")).toHaveText("2");
  });

  test("each driver in the week carries their own count for that week", async ({ page }) => {
    await page.goto(`/work-trackers/${WEEK_START}`);

    const driverRow = page.getByRole("row", { name: /Withdrawal Driver/ });
    await expect(driverRow).toBeVisible({ timeout: 30_000 });
    await expect(driverRow.locator("[data-testid=withdrawn-badge]")).toHaveText("2");
  });

  test("a week with no withdrawals carries no badge at all", async ({ page }) => {
    await page.goto("/work-trackers");

    const thisWeek = page.getByRole("row", { name: /This Week/ });
    await expect(thisWeek).toBeVisible({ timeout: 30_000 });
    await expect(thisWeek.locator("[data-testid=withdrawn-badge]")).toHaveCount(0);
  });
});
