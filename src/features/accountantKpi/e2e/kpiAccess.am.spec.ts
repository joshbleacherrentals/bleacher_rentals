import { test, expect } from "@playwright/test";

/**
 * The KPI tab is for administrators and accountants (docs/specs/accountant-kpi.md §3, S12). The
 * path gate comes first: whatever `?tab` says, an account manager never reaches /accountant.
 * Written, not run locally (project rule).
 */
test.describe("KPI access (account manager)", () => {
  test("S12: /accountant?tab=kpi is not reachable", async ({ page }) => {
    // A client-side redirect aborts the navigation. That is a refusal, not an error.
    await page.goto("/accountant?tab=kpi").catch(() => {});

    await expect(page, "reached /accountant?tab=kpi").not.toHaveURL(/\/accountant/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("kpi-tab")).toHaveCount(0);
  });
});
